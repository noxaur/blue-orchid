import { Effect } from "effect";

import { followed, narrowByTitle, unfollow as unfollowShow } from "../../follows/follows.ts";
import { defineCommand } from "../command.ts";
import type { Reply } from "../Reply.ts";
import { trouble } from "../Reply.ts";

/** Matches only the shows the person follows, so "frieren" never means a season they don't follow. */
export const unfollow = defineCommand({
  description: "Stop messages about a show",
  options: { show: { description: "Title of the show" } },
  run: (option, caller) =>
    Effect.gen(function* () {
      const query = option("show");
      const shows = narrowByTitle(
        (yield* followed(caller)).filter((show) => show.title.toLowerCase().includes(query.toLowerCase())),
        query,
      );
      const [show] = shows;
      if (shows.length === 1 && show !== undefined) {
        return { _tag: "Unfollowed", ...(yield* unfollowShow(caller, show.id)) } satisfies Reply;
      }
      return shows.length === 0
        ? ({ _tag: "NoMatch", query: option("show") } satisfies Reply)
        : ({ _tag: "Choose", action: "unfollow", query: option("show"), shows } satisfies Reply);
    }).pipe(
      Effect.catchTags({
        ShowNotFound: () => Effect.succeed<Reply>({ _tag: "NoMatch", query: option("show") }),
        StoreFailed: () => Effect.succeed(trouble),
      }),
    ),
});
