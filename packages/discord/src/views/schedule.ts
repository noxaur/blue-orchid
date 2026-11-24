import type { Reply } from "@blue-orchid/core";

import {
  accent,
  container,
  fitLines,
  more,
  notice,
  releaseLabel,
  separator,
  stamp,
  text,
  title,
  when,
  withCover,
} from "./blocks.ts";

/** Each release with its cover takes up to four components, so this many stay under Discord's 40. */
const maxWithCovers = 8;

/** C1 and C1b: the next seven days, of the shows you follow or of every show. */
export const scheduleView = ({ scope, releases }: Extract<Reply, { _tag: "Schedule" }>) => {
  if (releases.length === 0) {
    return scope === "following"
      ? notice(
          accent.neutral,
          "Nothing you follow airs in the next seven days",
          "See every show with /schedule shows: All.",
        )
      : notice(accent.neutral, "Nothing airs in the next seven days", "Check back after the next schedule sync.");
  }
  if (scope === "following") {
    const shown = releases.slice(0, maxWithCovers);
    return container(accent.reply, [
      text("## Next seven days"),
      separator(),
      ...shown.flatMap(({ show, release }, index) => [
        ...(index === 0 ? [] : [separator(false)]),
        withCover(show, `### ${title(show)}\n-# ${releaseLabel(release)}\n${when(release.airsAt)}`),
      ]),
      ...more(releases.length - shown.length),
    ]);
  }
  /** The whole catalog leaves room only for one compact line per release. */
  const list = fitLines(
    releases.map(({ show, release }) => `${stamp(release.airsAt, "f")} **${title(show)}** · ${releaseLabel(release)}`),
  );
  return container(accent.reply, [
    text("## Next seven days\n-# All shows"),
    separator(),
    text(list.text),
    ...more(releases.length - list.count),
  ]);
};
