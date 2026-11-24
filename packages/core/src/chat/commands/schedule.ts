import { Effect } from "effect";

import { followed } from "../../follows/follows.ts";
import { nextSevenDays } from "../../schedule/schedule.ts";
import { defineCommand } from "../command.ts";
import { trouble } from "../Reply.ts";

export const schedule = defineCommand({
  description: "Episodes airing in the next seven days",
  options: {
    shows: {
      description: "Which shows to list",
      default: "following",
      choices: [
        { value: "following", label: "Following" },
        { value: "all", label: "All" },
      ],
    },
  },
  run: (option, caller) =>
    Effect.gen(function* () {
      const releases = yield* nextSevenDays();
      if (option("shows") === "all") {
        return { _tag: "Schedule", scope: "all", releases } as const;
      }
      const mine = new Set((yield* followed(caller)).map((show) => show.id));
      return {
        _tag: "Schedule",
        scope: "following",
        releases: releases.filter(({ show }) => mine.has(show.id)),
      } as const;
    }).pipe(Effect.catchTag("StoreFailed", () => Effect.succeed(trouble))),
});
