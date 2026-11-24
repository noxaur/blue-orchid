import { SourceUnavailable } from "@blue-orchid/domain";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";

import { Catalog } from "../ports/Catalog.ts";
import { fakeCatalogSource } from "../testing/catalogSource.ts";
import { frieren } from "../testing/fixtures.ts";
import { makeInMemory } from "../testing/InMemory.ts";
import { importCatalog, sliceFor } from "./importCatalog.ts";

const at = (iso: string) => DateTime.makeUnsafe(iso);

describe("sliceFor", () => {
  it("alternates airing and upcoming on even hours and walks the years back on odd hours", () => {
    const hours = ["2026-11-23T00:00:00Z", "2026-11-23T01:00:00Z", "2026-11-23T02:00:00Z", "2026-11-23T03:00:00Z"];
    const slices = hours.map((iso) => sliceFor(at(iso)));
    expect(
      slices
        .filter((slice) => slice._tag !== "Year")
        .map((slice) => slice._tag)
        .toSorted(),
    ).toEqual(["Airing", "Upcoming"]);
    const years = slices.flatMap((slice) => (slice._tag === "Year" ? [slice.year] : []));
    expect(years).toHaveLength(2);
    expect(Math.abs(years[0]! - years[1]!)).toBe(1);
  });

  it("covers every year from 1917 to next year", () => {
    const start = DateTime.toEpochMillis(at("2026-11-23T01:00:00Z"));
    const years = new Set(
      Array.from({ length: 111 }, (_, index) => sliceFor(DateTime.makeUnsafe(start + index * 2 * 3_600_000))).flatMap(
        (slice) => (slice._tag === "Year" ? [slice.year] : []),
      ),
    );
    expect(years.size).toBe(111);
    expect([Math.min(...years), Math.max(...years)]).toEqual([1917, 2027]);
  });
});

describe("importCatalog", () => {
  it.effect(
    "stores the slice's shows, and a second run changes nothing",
    Effect.fn(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(at("2026-11-23T00:00:00Z")));
      const memory = yield* makeInMemory({});
      const layer = Layer.merge(
        memory.layer,
        fakeCatalogSource(() => Effect.succeed([frieren])),
      );
      const read = Catalog.use((catalog) => catalog.searchShows("", 100)).pipe(Effect.provide(layer));

      expect((yield* importCatalog().pipe(Effect.provide(layer))).shows).toBe(1);
      const first = yield* read;
      yield* importCatalog().pipe(Effect.provide(layer));
      expect(yield* read).toEqual(first);
      expect(first.map((show) => show.id)).toEqual([frieren.id]);
    }),
  );

  it.effect(
    "keeps the catalog as it was when the source fails",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({ shows: [frieren] });
      const layer = Layer.merge(
        memory.layer,
        fakeCatalogSource(() => Effect.fail(new SourceUnavailable({ source: "fake", cause: "down" }))),
      );
      expect((yield* importCatalog().pipe(Effect.provide(layer))).shows).toBe(0);
      const show = yield* Catalog.use((catalog) => catalog.show(frieren.id)).pipe(Effect.provide(layer));
      expect(show).toEqual(frieren);
    }),
  );
});
