import { CatalogSource } from "@blue-orchid/core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

import { AniListCatalogLive } from "./source.ts";

const goblin = {
  id: 209219,
  idMal: 63712,
  title: { english: "So What's Wrong with Getting Reborn as a Goblin?", romaji: "Tensei Goblin dakedo Shitsumon Aru?" },
  coverImage: { large: "https://img.anili.st/goblin.jpg" },
  episodes: 12,
  format: "ONA",
  status: "RELEASING",
  season: "FALL",
  seasonYear: 2026,
  startDate: { year: 2026, month: 10, day: 5 },
  endDate: { year: 2026, month: 12, day: null },
  duration: 24,
};

const announced = {
  ...goblin,
  id: 999,
  idMal: null,
  title: { english: null, romaji: "Mada Mada" },
  coverImage: null,
  episodes: null,
  format: "MUSIC",
  status: "NOT_YET_RELEASED",
  season: null,
  seasonYear: null,
  startDate: { year: 2027, month: null, day: null },
  endDate: null,
  duration: null,
};

const page = (hasNextPage: boolean, media: ReadonlyArray<unknown>) => ({
  data: { Page: { pageInfo: { hasNextPage }, media } },
});

/** Answers each request with the next of `pages`, and records the request bodies. */
const anilistAnswering = (pages: ReadonlyArray<unknown>) => {
  const bodies: Array<string> = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      bodies.push(request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "");
      return HttpClientResponse.fromWeb(request, new Response(JSON.stringify(pages[bodies.length - 1])));
    }),
  );
  return { bodies, layer: AniListCatalogLive.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client))) };
};

describe("AniListCatalogLive", () => {
  it.effect(
    "reads every page of a slice into shows",
    Effect.fn(function* () {
      const anilist = anilistAnswering([page(true, [goblin]), page(false, [announced])]);
      const shows = yield* CatalogSource.use((source) => source.fetch({ _tag: "Airing" })).pipe(
        Effect.provide(anilist.layer),
      );

      expect(shows[0]).toMatchObject({
        id: "anilist:209219",
        title: "So What's Wrong with Getting Reborn as a Goblin?",
        imageUrl: "https://img.anili.st/goblin.jpg",
        episodes: 12,
        format: "ona",
        status: "airing",
        season: "fall",
        year: 2026,
        startDate: "2026-10-05",
        endDate: "2026-12",
        episodeMinutes: 24,
        siteIds: ["anilist:209219", "myanimelist:63712"],
      });
      expect(shows[1]).toMatchObject({
        title: "Mada Mada",
        format: null,
        status: "upcoming",
        startDate: "2027",
        endDate: null,
        siteIds: ["anilist:999"],
      });
      expect(anilist.bodies.map((body) => body.match(/"page":(\d+)/)?.[1])).toEqual(["1", "2"]);
      expect(anilist.bodies[0]).toContain('"status":"RELEASING"');
    }),
  );

  it.effect(
    "skips a show the catalog can't hold and keeps the rest of the slice",
    Effect.fn(function* () {
      const untitled = { ...goblin, id: 1, title: { english: "", romaji: null } };
      const anilist = anilistAnswering([page(false, [untitled, goblin])]);
      const shows = yield* CatalogSource.use((source) => source.fetch({ _tag: "Airing" })).pipe(
        Effect.provide(anilist.layer),
      );
      expect(shows.map((show) => show.id)).toEqual(["anilist:209219"]);
    }),
  );

  it.effect(
    "asks for one start year as a FuzzyDateInt range",
    Effect.fn(function* () {
      const anilist = anilistAnswering([page(false, [])]);
      yield* CatalogSource.use((source) => source.fetch({ _tag: "Year", year: 2009 })).pipe(
        Effect.provide(anilist.layer),
      );
      expect(anilist.bodies[0]).toContain('"from":20089999,"to":20100000');
    }),
  );

  it.effect(
    "fails as SourceUnavailable when AniList answers something else",
    Effect.fn(function* () {
      const anilist = anilistAnswering([{ errors: [{ message: "Too Many Requests." }] }]);
      const error = yield* Effect.flip(
        CatalogSource.use((source) => source.fetch({ _tag: "Upcoming" })).pipe(Effect.provide(anilist.layer)),
      );
      expect(error._tag).toBe("SourceUnavailable");
    }),
  );
});
