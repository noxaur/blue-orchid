import type { ShowId } from "@blue-orchid/domain";
import { Show } from "@blue-orchid/domain";
import { Effect } from "effect";

import { Catalog } from "../ports/Catalog.ts";

/**
 * Gives each show the id of the stored show that already has one of its site ids, so a show keeps the id its
 * follows and releases use, even when a source later names it by another site first.
 */
export const keepStoredIds = Effect.fn("Catalog.keepStoredIds")(function* (shows: ReadonlyArray<Show>) {
  const catalog = yield* Catalog;
  const owners = yield* catalog.ownersOf([...new Set(shows.flatMap((show) => show.siteIds))]);
  const ids = new Map(
    shows.map((show) => [show.id, show.siteIds.map((siteId) => owners.get(siteId)).find((id) => id !== undefined)]),
  );
  const idOf = (id: ShowId): ShowId => ids.get(id) ?? id;
  return {
    idOf,
    shows: shows.map((show) => {
      const id = idOf(show.id);
      return id === show.id
        ? show
        : new Show({
            id,
            title: show.title,
            imageUrl: show.imageUrl,
            episodes: show.episodes,
            format: show.format,
            status: show.status,
            season: show.season,
            year: show.year,
            startDate: show.startDate,
            endDate: show.endDate,
            episodeMinutes: show.episodeMinutes,
            siteIds: [id, ...show.siteIds.filter((siteId) => siteId !== id)],
          });
    }),
  };
});
