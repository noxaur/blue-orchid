import { Effect } from "effect";

import { followedWithNext } from "../../follows/follows.ts";
import { defineCommand } from "../command.ts";
import type { Reply } from "../Reply.ts";
import { trouble } from "../Reply.ts";

export const following = defineCommand({
  description: "The shows you follow",
  options: {},
  run: (_, caller) =>
    followedWithNext(caller).pipe(
      Effect.map((shows): Reply => ({ _tag: "Following", shows })),
      Effect.catchTag("StoreFailed", () => Effect.succeed(trouble)),
    ),
});
