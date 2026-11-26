import { Show } from "@blue-orchid/domain";
import { DateTime, Effect, Result } from "effect";

import { Catalog } from "../ports/Catalog.ts";
import type { CatalogSlice } from "../ports/CatalogSource.ts";
import { CatalogSource } from "../ports/CatalogSource.ts";
import { ShowDetailsSources } from "../ports/ShowDetails.ts";
import { keepStoredIds } from "./storedIds.ts";

const firstYear = 1917;

// ponytail: a fixed cap per run keeps a details source's request count low; a show it can't fill is asked again
// on the slice's next pass. Remember misses if that ever costs too much.
const maxLookups = 50;

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
  const stored = yield* catalog.shows(shows.map((show) => show.id));
  const sources = yield* ShowDetailsSources;
  let lookups = 0;
  // A detail the catalog source lacks is kept from the stored show, so the next slice never blanks it again.
  const filled = yield* Effect.forEach(
    shows,
    Effect.fn(function* (show) {
      let episodeMinutes = show.episodeMinutes ?? stored.get(show.id)?.episodeMinutes ?? null;
      for (const details of sources) {
        const siteId = show.siteIds.find((id) => id.startsWith(`${details.site}:`));
        if (episodeMinutes !== null || siteId === undefined || lookups >= maxLookups) {
          continue;
        }
        lookups++;
        const found = yield* Effect.result(details.fetch(siteId.slice(details.site.length + 1)));
        if (Result.isFailure(found)) {
          yield* Effect.logWarning("Details source failed", found.failure);
        } else {
          episodeMinutes = found.success?.episodeMinutes ?? null;
        }
      }
      return episodeMinutes === show.episodeMinutes
        ? show
        : new Show({
            id: show.id,
            title: show.title,
            imageUrl: show.imageUrl,
            episodes: show.episodes,
            format: show.format,
            status: show.status,
            season: show.season,
            year: show.year,
            startDate: show.startDate,
            endDate: show.endDate,
            episodeMinutes,
            siteIds: show.siteIds,
          });
    }),
  );
  yield* catalog.save({ shows: filled, releases: [], updates: [] });
  return { slice, shows: result.success.length, lookups };
});
