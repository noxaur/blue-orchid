import { DateTime, Effect, Result } from "effect";

import { Catalog } from "../ports/Catalog.ts";
import type { CatalogSlice } from "../ports/CatalogSource.ts";
import { CatalogSource } from "../ports/CatalogSource.ts";
import { keepStoredIds } from "./storedIds.ts";

const firstYear = 1917;

/**
 * Hourly runs: even hours alternate airing and upcoming shows, odd hours walk the start years from next year back,
 * then take the shows with no start date.
 */
export const sliceFor = (now: DateTime.Utc): CatalogSlice => {
  const hour = Math.floor(DateTime.toEpochMillis(now) / 3_600_000);
  if (hour % 2 === 0) {
    return hour % 4 === 0 ? { _tag: "Airing" } : { _tag: "Upcoming" };
  }
  const nextYear = DateTime.getPartUtc(now, "year") + 1;
  const years = nextYear - firstYear + 1;
  const step = ((hour - 1) / 2) % (years + 1);
  return step === years ? { _tag: "Undated" } : { _tag: "Year", year: nextYear - step };
};

export const importCatalog = Effect.fn("Catalog.import")(function* () {
  const source = yield* CatalogSource;
  const catalog = yield* Catalog;
  const slice = sliceFor(yield* DateTime.now);
  const result = yield* Effect.result(source.fetch(slice));
  if (Result.isFailure(result)) {
    yield* Effect.logWarning("Catalog source failed", result.failure);
    return { slice, shows: 0 };
  }
  const { shows } = yield* keepStoredIds(result.success);
  yield* catalog.save({ shows, releases: [], updates: [] });
  return { slice, shows: result.success.length };
});
