import { Effect } from "effect";

import { follow as followShow, matchShow } from "../../follows/follows.ts";
import { defineCommand } from "../command.ts";
import type { Reply } from "../Reply.ts";
import { trouble } from "../Reply.ts";

export const follow = defineCommand({
  description: "Get a direct message when a show's schedule changes",
  options: { show: { description: "Title of the show" } },
  run: (option, caller) =>
    Effect.gen(function* () {
      const shows = yield* matchShow(option("show"));
      const [only] = shows;
      if (shows.length > 1 || only === undefined) {
        return { _tag: "Choose", action: "follow", query: option("show"), shows } satisfies Reply;
      }
      return { _tag: "Followed", ...(yield* followShow(caller, only.id)) } satisfies Reply;
    }).pipe(
      Effect.catchTags({
        ShowNotFound: () => Effect.succeed<Reply>({ _tag: "NoMatch", query: option("show") }),
        StoreFailed: () => Effect.succeed(trouble),
      }),
    ),
});
