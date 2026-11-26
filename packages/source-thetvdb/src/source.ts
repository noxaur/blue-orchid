import type { CatalogSlice, ScheduleSource } from "@blue-orchid/core";
import { CatalogSource } from "@blue-orchid/core";
import type { Season, Status } from "@blue-orchid/domain";
import { Release, Show, ShowId, SourceUnavailable } from "@blue-orchid/domain";
import { DateTime, Effect, Redacted, Schedule, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

export const theTvdbApi = "https://api4.thetvdb.com/v4";

/** Requests in flight at once, so one sync stays well clear of TheTVDB's "excessive calls". */
const concurrency = 4;

const envelope = <S extends Schema.Top>(data: S) => Schema.Struct({ data });
const optional = <S extends Schema.Top>(schema: S) => Schema.optional(Schema.NullOr(schema));

const Login = envelope(Schema.Struct({ token: Schema.String }));
const Named = envelope(Schema.Array(Schema.Struct({ id: Schema.Number, name: Schema.String })));
const Episode = Schema.Struct({
  aired: optional(Schema.String),
  seasonNumber: Schema.Number,
  number: Schema.Number,
  absoluteNumber: optional(Schema.Number),
});
/** The fields we read of a series base or extended record. */
const Series = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  firstAired: optional(Schema.String),
  lastAired: optional(Schema.String),
  nextAired: optional(Schema.String),
  airsTime: optional(Schema.String),
  averageRuntime: optional(Schema.Number),
  status: optional(Schema.Struct({ name: optional(Schema.String) })),
  episodes: optional(Schema.Array(Episode)),
});
type Series = typeof Series.Type;
const Filtered = envelope(Schema.NullOr(Schema.Array(Series)));
const Extended = envelope(Series);

/** TheTVDB's series statuses and ours. Continuing and Upcoming series can still have an episode ahead. */
const statuses: ReadonlyArray<readonly [string, Status]> = [
  ["Continuing", "airing"],
  ["Upcoming", "upcoming"],
  ["Ended", "finished"],
];

const day = /^(\d{4})-(\d{2})-(\d{2})$/;

/** TheTVDB gives a non-US series' times in its country's capital: Tokyo, which keeps UTC+9 all year. */
const tokyoToUtc = (date: string, time: string) => {
  const parts = day.exec(date);
  const clock = /^(\d{1,2}):(\d{2})/.exec(time);
  if (parts === null || clock === null) {
    return null;
  }
  // Japanese listings run past midnight, so 25:30 is 1:30 the next morning.
  return DateTime.makeUnsafe(
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), Number(clock[1]) - 9, Number(clock[2])),
  );
};

const seasons = ["winter", "spring", "summer", "fall"] as const;

/** Quarters, except that a show starting in the second half of a quarter's last month opens the next season. */
const seasonOf = (date: string | null): Season | null => {
  if (date === null) {
    return null;
  }
  const month = Number(date.slice(5, 7));
  const late = month % 3 === 0 && Number(date.slice(8, 10)) >= 15;
  return seasons[(Math.floor((month - 1) / 3) + (late ? 1 : 0)) % 4] ?? null;
};

const idOf = (series: Series) => ShowId.make(`thetvdb:${series.id}`);

const showOf = (series: Series) => {
  const status = statuses.find(([name]) => name === series.status?.name)?.[1] ?? null;
  const startDate = day.test(series.firstAired ?? "") ? (series.firstAired ?? null) : null;
  const endDate = status === "finished" && day.test(series.lastAired ?? "") ? (series.lastAired ?? null) : null;
  return new Show({
    id: idOf(series),
    title: series.name,
    // TheTVDB's licence does not cover its artwork.
    imageUrl: null,
    episodes: null,
    format: "tv",
    status,
    season: seasonOf(startDate),
    year: startDate === null ? null : Number(startDate.slice(0, 4)),
    startDate,
    endDate,
    episodeMinutes: series.averageRuntime ?? null,
    siteIds: [idOf(series)],
  });
};

const releasesOf = (series: Series, from: DateTime.Utc, to: DateTime.Utc) => {
  const regular = (series.episodes ?? []).filter((episode) => episode.seasonNumber > 0);
  const oneSeason = regular.every((episode) => episode.seasonNumber === 1);
  return regular.flatMap((episode) => {
    // The episode's place in the whole series, so season 2's third episode never takes season 1's key.
    const absolute = episode.absoluteNumber ?? 0;
    const number = absolute > 0 ? absolute : oneSeason ? episode.number : 0;
    const airsAt = tokyoToUtc(episode.aired ?? "", series.airsTime ?? "");
    return !Number.isInteger(number) ||
      number <= 0 ||
      airsAt === null ||
      DateTime.isLessThan(airsAt, from) ||
      DateTime.isGreaterThanOrEqualTo(airsAt, to)
      ? []
      : [new Release({ showId: idOf(series), episode: number, kind: "raw", region: "JP", airsAt })];
  });
};

/**
 * Signs in to TheTVDB and finds Japanese anime. Its free key needs attribution wherever its data is shown:
 * https://thetvdb.com/api-information
 */
const makeTheTvdb = Effect.fn("TheTvdb.make")(function* (apiKey: Redacted.Redacted) {
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.filterStatusOk,
    HttpClient.retryTransient({ schedule: Schedule.spaced("1 minute"), times: 2 }),
  );

  /** A token lasts a month; one per run keeps it simple. */
  const signIn = Effect.fn("TheTvdb.signIn")(function* () {
    const { token } = (yield* HttpClientRequest.post(`${theTvdbApi}/login`).pipe(
      HttpClientRequest.bodyJsonUnsafe({ apikey: Redacted.value(apiKey) }),
      client.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Login)),
    )).data;
    const get = <S extends Schema.Top>(path: string, schema: S, params: Record<string, string> = {}) =>
      HttpClientRequest.get(`${theTvdbApi}${path}`).pipe(
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.setUrlParams(params),
        client.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
      );

    // TheTVDB asks clients not to hard-code these ids, so look them up by name.
    const [genres, seriesStatuses] = yield* Effect.all([get("/genres", Named), get("/series/statuses", Named)]);
    const anime = genres.data.find((genre) => genre.name === "Anime");
    if (anime === undefined) {
      return yield* Effect.fail("TheTVDB has no Anime genre");
    }
    const statusId = (name: string) => seriesStatuses.data.find((status) => status.name === name)?.id;

    /** Japanese anime matching `params`; /series/filter only searches one country and original language. */
    const findAnime = (params: Record<string, string>) =>
      get("/series/filter", Filtered, { country: "jpn", lang: "jpn", genre: String(anime.id), ...params }).pipe(
        Effect.map((filtered) => filtered.data ?? []),
      );
    /** Japanese anime in one of TheTVDB's statuses, or none when TheTVDB has no such status. */
    const findByStatus = (name: string) => {
      const id = statusId(name);
      return id === undefined ? Effect.succeed([]) : findAnime({ status: String(id) });
    };
    const extended = (id: number) =>
      get(`/series/${id}/extended`, Extended, { meta: "episodes", short: "true" }).pipe(Effect.map((r) => r.data));
    return { findAnime, findByStatus, extended };
  });
  return { signIn };
});

const unavailable = (cause: unknown) => new SourceUnavailable({ source: "thetvdb", cause });

/** TheTVDB as the catalog source: each slice is one /series/filter search for Japanese anime. */
export const makeTheTvdbCatalog = Effect.fn("TheTvdb.makeCatalog")(function* (apiKey: Redacted.Redacted) {
  const { signIn } = yield* makeTheTvdb(apiKey);
  const fetch = Effect.fn("TheTvdb.fetchCatalog")(function* (slice: CatalogSlice) {
    const tvdb = yield* signIn();
    switch (slice._tag) {
      case "Airing":
        return (yield* tvdb.findByStatus("Continuing")).map(showOf);
      case "Upcoming":
        return (yield* tvdb.findByStatus("Upcoming")).map(showOf);
      case "Year":
        return (yield* tvdb.findAnime({ year: String(slice.year) })).map(showOf);
      case "Undated":
        // /series/filter can't ask for series without a first air date.
        return [];
    }
  });
  return CatalogSource.of({ name: "thetvdb", fetch: (slice) => fetch(slice).pipe(Effect.mapError(unavailable)) });
});

/**
 * TheTVDB as the schedule source: every continuing or upcoming Japanese anime whose next episode falls in the window,
 * each episode at its air date and the series' air time, as raw JP releases.
 */
export const makeTheTvdbSchedule = Effect.fn("TheTvdb.makeSchedule")(function* (apiKey: Redacted.Redacted) {
  const { signIn } = yield* makeTheTvdb(apiKey);
  const fetch = Effect.fn("TheTvdb.fetchSchedule")(function* (from: DateTime.Utc, to: DateTime.Utc) {
    const tvdb = yield* signIn();
    // nextAired is a Tokyo date, so widen the window by a day each side and let the exact times decide.
    const firstDay = DateTime.formatIso(DateTime.subtract(from, { days: 1 })).slice(0, 10);
    const lastDay = DateTime.formatIso(DateTime.add(to, { days: 1 })).slice(0, 10);
    const candidates = (yield* Effect.all([tvdb.findByStatus("Continuing"), tvdb.findByStatus("Upcoming")])).flat();
    const ids = [
      ...new Set(
        candidates
          .filter((series) => (series.nextAired ?? "") >= firstDay && (series.nextAired ?? "") <= lastDay)
          .map((series) => series.id),
      ),
    ];
    const series = yield* Effect.forEach(ids, tvdb.extended, { concurrency });
    const found = series.map((one) => ({ show: showOf(one), releases: releasesOf(one, from, to) }));
    return {
      shows: found.filter((one) => one.releases.length > 0).map((one) => one.show),
      releases: found.flatMap((one) => one.releases),
    };
  });
  const source: ScheduleSource = {
    name: "thetvdb",
    fetch: (from, to) => fetch(from, to).pipe(Effect.mapError(unavailable)),
  };
  return source;
});
