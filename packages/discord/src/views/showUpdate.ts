import type { Reply } from "@blue-orchid/core";

import {
  accent,
  button,
  container,
  releaseLabel,
  row,
  separator,
  stamp,
  text,
  title,
  when,
  withCover,
} from "./blocks.ts";

/** C6 and C7: a DM about a change to a show you follow. */
export const showUpdateView = ({ show, update }: Extract<Reply, { _tag: "ShowUpdate" }>) => {
  const { change } = update;
  const moved = change._tag === "EpisodeRescheduled";
  return container(moved ? accent.moved : accent.scheduled, [
    withCover(
      show,
      `-# ${moved ? "Episode moved" : "New episode"}\n## ${title(show)}\n-# ${releaseLabel(change.release)}`,
    ),
    text(
      moved ? `~~${stamp(change.previousAirsAt, "F")}~~\n${when(change.release.airsAt)}` : when(change.release.airsAt),
    ),
    separator(),
    row(button("unfollow", show.id, "Unfollow")),
  ]);
};
