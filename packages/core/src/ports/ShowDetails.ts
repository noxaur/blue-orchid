import type { Show, SourceUnavailable } from "@blue-orchid/domain";
import type { Effect } from "effect";
import { Context, Layer } from "effect";

/** What a details source may fill in on a show the catalog source left blank. */
export type Details = Pick<Show, "episodeMinutes">;

/** A site that knows more about a show than the catalog source, such as TheTVDB's runtimes. */
export interface ShowDetailsSource {
  /** The site id prefix it reads, such as "thetvdb" for `thetvdb:81189`. */
  readonly site: string;
  /** Details for the show with this id on the site, or undefined when the site doesn't know it. */
  readonly fetch: (id: string) => Effect.Effect<Details | undefined, SourceUnavailable>;
}

/** Every details source. Empty when none is configured, such as without an API key. */
export class ShowDetailsSources extends Context.Service<ShowDetailsSources, ReadonlyArray<ShowDetailsSource>>()(
  "orchid/core/ShowDetailsSources",
) {
  static readonly layer = (sources: ReadonlyArray<ShowDetailsSource>) => Layer.succeed(ShowDetailsSources, sources);
}
