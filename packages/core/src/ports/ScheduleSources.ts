import type { Release, Show, SourceUnavailable } from "@blue-orchid/domain";
import type { DateTime, Effect } from "effect";
import { Context, Layer } from "effect";

export interface SourceSnapshot {
  readonly shows: ReadonlyArray<Show>;
  readonly releases: ReadonlyArray<Release>;
}

/** One place schedule data comes from, such as Syoboi Calendar. Implement it in its own package and add it to the list. */
export interface ScheduleSource {
  readonly name: string;
  readonly fetch: (from: DateTime.Utc, to: DateTime.Utc) => Effect.Effect<SourceSnapshot, SourceUnavailable>;
}

/** Every source, most trusted first: when two sources give the same release, the earlier one wins. */
export class ScheduleSources extends Context.Service<ScheduleSources, ReadonlyArray<ScheduleSource>>()(
  "orchid/core/ScheduleSources",
) {
  static readonly layer = (sources: ReadonlyArray<ScheduleSource>) => Layer.succeed(ScheduleSources, sources);
}
