import type { Release, Show, ShowId, ShowNotFound, StoreFailed, Update } from "@blue-orchid/domain";
import type { DateTime, Effect } from "effect";
import { Context } from "effect";

export interface ScheduledRelease {
  readonly show: Show;
  readonly release: Release;
}

/** A release as stored. `revision` counts the times it has changed, so each change gets its own update id. */
export interface StoredRelease {
  readonly release: Release;
  readonly revision: number;
}

export interface CatalogChanges {
  readonly shows: ReadonlyArray<Show>;
  /** Only releases that are new or moved, each with its new revision. */
  readonly releases: ReadonlyArray<StoredRelease>;
  readonly updates: ReadonlyArray<Update>;
}

/** Shows, releases and updates in our own database. Visitors and bots only ever read from here, never from a source. */
export class Catalog extends Context.Service<
  Catalog,
  {
    /** Releases with `from <= airsAt < to`, earliest first. */
    readonly releasesBetween: (
      from: DateTime.Utc,
      to: DateTime.Utc,
    ) => Effect.Effect<ReadonlyArray<ScheduledRelease>, StoreFailed>;
    readonly show: (id: ShowId) => Effect.Effect<Show, ShowNotFound | StoreFailed>;
    readonly showReleases: (id: ShowId) => Effect.Effect<ReadonlyArray<Release>, StoreFailed>;
    readonly nextRelease: (id: ShowId, from: DateTime.Utc) => Effect.Effect<Release | undefined, StoreFailed>;
    /** Each show's earliest release at or after `from`, in one round trip. Shows with none are left out. */
    readonly nextReleases: (
      ids: ReadonlyArray<ShowId>,
      from: DateTime.Utc,
    ) => Effect.Effect<ReadonlyMap<ShowId, Release>, StoreFailed>;
    /** Shows whose title contains the text, best match first. */
    readonly searchShows: (title: string, limit: number) => Effect.Effect<ReadonlyArray<Show>, StoreFailed>;
    readonly releasesByKey: (keys: ReadonlyArray<string>) => Effect.Effect<ReadonlyArray<StoredRelease>, StoreFailed>;
    /**
     * Writes everything or nothing. A release must never be saved without its update: a retry would then see no
     * change and the update would be lost. Updates whose id exists are skipped, and a release is only
     * replaced by a higher revision, so repeating a save, or two runs saving the same revision, is safe.
     */
    readonly save: (changes: CatalogChanges) => Effect.Effect<void, StoreFailed>;
  }
>()("orchid/core/Catalog") {}
