import type { Reply } from "@blue-orchid/core";

import {
  accent,
  clip,
  container,
  covers,
  fitLines,
  more,
  notice,
  releaseLabel,
  row,
  showMenu,
  stamp,
  text,
  title,
} from "./blocks.ts";

/** C5: the shows you follow, their next episodes, and a menu to unfollow some. */
export const followingView = ({ shows }: Extract<Reply, { _tag: "Following" }>) => {
  if (shows.length === 0) {
    return notice(accent.neutral, "You don't follow any shows yet", "Use /follow with a title to start.");
  }
  /** The menu holds 25 shows, so the list never names more than it can unfollow. */
  const list = fitLines(
    shows
      .slice(0, 25)
      .map(({ show, next }) =>
        next === undefined
          ? `**${title(show)}**\n-# Nothing scheduled`
          : `**${title(show)}**\n-# Next: ${releaseLabel(next)} · ${stamp(next.airsAt, "f")}`,
      ),
  );
  const listed = shows.slice(0, list.count);
  return container(accent.reply, [
    text(`## Following · ${shows.length}`),
    ...covers(listed.map(({ show }) => show)),
    text(list.text),
    ...more(shows.length - list.count),
    row(
      showMenu(
        "unfollowMany",
        "Unfollow shows…",
        listed.map(({ show }) => ({ label: clip(show.title), value: show.id })),
        true,
      ),
    ),
  ]);
};
