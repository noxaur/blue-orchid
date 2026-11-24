import type { Reply } from "@blue-orchid/core";

import {
  accent,
  aniListLink,
  button,
  container,
  releaseLabel,
  row,
  separator,
  showFacts,
  text,
  title,
  when,
  withCover,
} from "./blocks.ts";

/** C2: you now follow a show. */
export const followedView = ({ show, next }: Extract<Reply, { _tag: "Followed" }>) =>
  container(accent.reply, [
    withCover(show, `-# Now following\n## ${title(show)}\n-# ${showFacts(show)}`),
    separator(),
    text(
      next === undefined
        ? "-# No episode scheduled yet. You'll get a message when one is."
        : `**Next episode**\n${releaseLabel(next)}\n${when(next.airsAt)}`,
    ),
    separator(),
    row(button("unfollow", show.id, "Unfollow"), ...aniListLink(show)),
  ]);
