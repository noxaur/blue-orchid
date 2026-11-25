import { CatalogSource } from "@blue-orchid/core";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";

import { WikidataCatalogLive } from "./source.ts";

const literal = (value: string) => ({ value });

const frieren = {
  item: literal("http://www.wikidata.org/entity/Q118135767"),
  itemLabel: literal("Frieren: Beyond Journey's End"),
  types: literal("Q63952888"),
  episodeCount: literal("28"),
  start: literal("2023-09-29T00:00:00Z|11"),
  end: literal("2024-03-22T00:00:00Z|11"),
  syoboiIds: literal("6680"),
  myanimelistIds: literal("52991 60001"),
  anilistIds: literal("154587"),
};

const announced = {
  item: literal("http://www.wikidata.org/entity/Q999"),
  itemLabel: literal("Mada Mada"),
  types: literal("Q1107 Q20650540"),
  start: literal("2027-04-01T00:00:00Z|10"),
};

const airing = {
  item: literal("http://www.wikidata.org/entity/Q555"),
  itemLabel: literal("Goblin"),
  types: literal("Q113671041"),
  start: literal("2026-10-05T00:00:00Z|11"),
  end: literal("2026-01-01T00:00:00Z|9"),
  anidbIds: literal("19942"),
};

const unnamed = { item: literal("http://www.wikidata.org/entity/Q777"), itemLabel: literal("Q777") };

/** Answers every request with `rows`, and records each request's SPARQL query. */
const wikidataAnswering = (rows: ReadonlyArray<unknown>) => {
  const queries: Array<string> = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const form = request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "";
      queries.push(new URLSearchParams(form).get("query") ?? "");
      return HttpClientResponse.fromWeb(request, new Response(JSON.stringify({ results: { bindings: rows } })));
    }),
  );
  return { queries, layer: WikidataCatalogLive.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client))) };
};

describe("WikidataCatalogLive", () => {
  it.effect(
    "maps items to shows, with the Syoboi id first so schedule releases land on them",
    Effect.fn(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe("2026-11-24T00:00:00Z")));
      const wikidata = wikidataAnswering([frieren, announced, airing, unnamed]);
      const shows = yield* CatalogSource.use((source) => source.fetch({ _tag: "Year", year: 2023 })).pipe(
        Effect.provide(wikidata.layer),
      );

      expect(shows).toHaveLength(3);
      expect(shows[0]).toMatchObject({
        id: "syoboi:6680",
        title: "Frieren: Beyond Journey's End",
        episodes: 28,
        format: "tv",
        status: "finished",
        season: "fall",
        year: 2023,
        startDate: "2023-09-29",
        endDate: "2024-03-22",
        siteIds: ["syoboi:6680", "anilist:154587", "myanimelist:52991", "myanimelist:60001", "wikidata:Q118135767"],
      });
      expect(shows[1]).toMatchObject({
        id: "wikidata:Q999",
        format: "movie",
        status: "upcoming",
        season: "spring",
        startDate: "2027-04",
      });
      // An end known only as "2026" is not past until 2027.
      expect(shows[2]).toMatchObject({ id: "anidb:19942", format: "ona", status: "airing", endDate: "2026" });
      expect(wikidata.queries[0]).toContain("FILTER(YEAR(?date) = 2023)");
      expect(wikidata.queries[1]).toContain("VALUES ?item { wd:Q118135767 wd:Q999 wd:Q555 wd:Q777 }");
      expect(wikidata.queries[1]).toContain(
        'HAVING (STRSTARTS(MIN(CONCAT(STR(?first), "|", STR(?firstPrecision))), "2023-"))',
      );
    }),
  );

  it.effect(
    "fails as SourceUnavailable when Wikidata answers something else",
    Effect.fn(function* () {
      const client = HttpClient.make((request) =>
        Effect.sync(() => HttpClientResponse.fromWeb(request, new Response("timeout", { status: 200 }))),
      );
      const error = yield* Effect.flip(
        CatalogSource.use((source) => source.fetch({ _tag: "Airing" })).pipe(
          Effect.provide(WikidataCatalogLive.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client)))),
        ),
      );
      expect(error._tag).toBe("SourceUnavailable");
    }),
  );
});
