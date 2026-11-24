import type { Reply } from "@blue-orchid/core";
import { ButtonStyle } from "discord-api-types/v10";

import { accent, button, container, row, title, withCover } from "./blocks.ts";

/** C4: you no longer follow a show, with a way back. */
export const unfollowedView = ({ show, wasFollowing }: Extract<Reply, { _tag: "Unfollowed" }>) =>
  container(accent.neutral, [
    withCover(
      show,
      `-# Not following\n## ${title(show)}\n-# ${wasFollowing ? "You won't get messages about this show." : "You weren't following this show."}`,
    ),
    row(button("follow", show.id, "Follow again", ButtonStyle.Primary)),
  ]);
