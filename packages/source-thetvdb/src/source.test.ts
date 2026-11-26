import { ScheduleSources, syncSchedule } from "@blue-orchid/core";
import { makeInMemory } from "@blue-orchid/core/testing";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Redacted } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";

import { makeTheTvdbCatalog, makeTheTvdbSchedule, theTvdbApi } from "./source.ts";

const frieren = {
  id: 424536,
  name: "葬送のフリーレン",
  firstAired: "2023-09-29",
  lastAired: "2026-11-27",
  nextAired: "2026-11-27",
  airsTime: "23:00",
  averageRuntime: 24,
  status: { id: 1, name: "Continuing" },
  episodes: [
    { aired: "2023-09-29", seasonNumber: 1, number: 1, absoluteNumber: 1 },
    { aired: "2026-11-20", seasonNumber: 2, number: 8, absoluteNumber: 36 },
    { aired: "2026-11-27", seasonNumber: 2, number: 9, absoluteNumber: 37 },
    { aired: "2026-11-27", seasonNumber: 0, number: 3, absoluteNumber: null },
    { aired: "2026-12-04", seasonNumber: 2, number: 10, absoluteNumber: null },
  ],
};

const lateNight = {
  id: 500,
  name: "深夜アニメ",
  firstAired: "2026-10-03",
  nextAired: "2026-11-28",
  airsTime: "25:30",
  status: { id: 1, name: "Continuing" },
  episodes: [{ aired: "2026-11-28", seasonNumber: 1, number: 9, absoluteNumber: 0 }],
};

const later = { id: 600, name: "来年", nextAired: "2027-04-02", status: { id: 1, name: "Continuing" } };
const announced = { id: 700, name: "新作", firstAired: "2027-01-08", status: { id: 2, name: "Upcoming" } };

/** Answers like TheTVDB, and records each request's path and query. */
const theTvdbAnswering = () => {
  const requests: Array<string> = [];
  const extended: Record<string, unknown> = { "/series/424536/extended": frieren, "/series/500/extended": lateNight };
  const client = HttpClient.make((request, url) =>
    Effect.sync(() => {
      const path = url.pathname.replace(new URL(theTvdbApi).pathname, "");
      requests.push(`${request.method} ${path}${url.search}`);
      const data =
        path === "/login"
          ? { token: "token" }
          : path === "/genres"
            ? [
                { id: 1, name: "Drama" },
                { id: 27, name: "Anime" },
              ]
            : path === "/series/statuses"
              ? [
                  { id: 1, name: "Continuing" },
                  { id: 2, name: "Ended" },
                  { id: 3, name: "Upcoming" },
                ]
              : path === "/series/filter"
                ? url.searchParams.get("status") === "1"
                  ? [frieren, lateNight, later]
                  : url.searchParams.get("status") === "3"
                    ? [announced]
                    : [frieren]
                : extended[path];
      return HttpClientResponse.fromWeb(
        request,
        data === undefined
          ? new Response("{}", { status: 404 })
          : new Response(JSON.stringify({ status: "success", data })),
      );
    }),
  );
  return { requests, layer: Layer.succeed(HttpClient.HttpClient, client) };
};

const apiKey = Redacted.make("key");
const from = DateTime.makeUnsafe("2026-11-26T00:00:00Z");

describe("makeTheTvdbSchedule", () => {
  it.effect(
    "turns each episode in the window into a raw JP release at the series' Tokyo air time",
    Effect.fn(function* () {
      const tvdb = theTvdbAnswering();
      const source = yield* makeTheTvdbSchedule(apiKey).pipe(Effect.provide(tvdb.layer));
      const snapshot = yield* source.fetch(from, DateTime.add(from, { days: 7 }));

      expect(
        snapshot.releases.map((r) => [r.showId, r.episode, r.kind, r.region, DateTime.formatIso(r.airsAt)]),
      ).toEqual([
        ["thetvdb:424536", 37, "raw", "JP", "2026-11-27T14:00:00.000Z"],
        ["thetvdb:500", 9, "raw", "JP", "2026-11-28T16:30:00.000Z"],
      ]);
      expect(snapshot.shows.map((show) => show.id)).toEqual(["thetvdb:424536", "thetvdb:500"]);
      expect(tvdb.requests).not.toContain("GET /series/600/extended?meta=episodes&short=true");
      expect(tvdb.requests).toContain("GET /series/filter?country=jpn&lang=jpn&genre=27&status=1");
    }),
  );

  it.effect(
    "a second sync with the same answers records no new updates",
    Effect.fn(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(from));
      const memory = yield* makeInMemory({});
      const source = yield* makeTheTvdbSchedule(apiKey).pipe(Effect.provide(theTvdbAnswering().layer));
      const layer = Layer.merge(memory.layer, ScheduleSources.layer([source]));

      expect((yield* syncSchedule().pipe(Effect.provide(layer))).updates).toBe(2);
      expect((yield* syncSchedule().pipe(Effect.provide(layer))).updates).toBe(0);
    }),
  );
});

describe("makeTheTvdbCatalog", () => {
  it.effect(
    "maps each slice's Japanese anime to shows",
    Effect.fn(function* () {
      const tvdb = theTvdbAnswering();
      const catalog = yield* makeTheTvdbCatalog(apiKey).pipe(Effect.provide(tvdb.layer));

      const [show] = yield* catalog.fetch({ _tag: "Airing" });
      expect(show).toMatchObject({
        id: "thetvdb:424536",
        title: "葬送のフリーレン",
        imageUrl: null,
        format: "tv",
        status: "airing",
        season: "fall",
        year: 2023,
        startDate: "2023-09-29",
        endDate: null,
        episodeMinutes: 24,
        siteIds: ["thetvdb:424536"],
      });
      expect((yield* catalog.fetch({ _tag: "Upcoming" })).map((s) => [s.id, s.status])).toEqual([
        ["thetvdb:700", "upcoming"],
      ]);
      expect(yield* catalog.fetch({ _tag: "Year", year: 2023 })).toHaveLength(1);
      expect(yield* catalog.fetch({ _tag: "Undated" })).toEqual([]);
      expect(tvdb.requests).toContain("GET /series/filter?country=jpn&lang=jpn&genre=27&year=2023");
    }),
  );
});
