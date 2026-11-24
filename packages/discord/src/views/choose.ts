import type { Reply } from "@blue-orchid/core";
import type { Show } from "@blue-orchid/domain";

import { accent, clip, container, escape, row, showFacts, showMenu, text } from "./blocks.ts";

/** "TV · Fall 2023", plus the site id when another option would read the same. */
const details = (show: Show, shows: ReadonlyArray<Show>) => {
  const facts = showFacts(show);
  const twin = shows.some((other) => other.id !== show.id && other.title === show.title && showFacts(other) === facts);
  return [facts, twin ? show.id : ""].filter((part) => part !== "").join(" · ");
};

/** C3: the title matched several shows, so the person picks one. */
export const chooseView = ({ action, query, shows }: Extract<Reply, { _tag: "Choose" }>) =>
  container(accent.reply, [
    text(`### Which one?\n-# Shows matching “${escape(clip(query, 200))}”`),
    row(
      showMenu(
        action,
        action === "follow" ? "Pick a show to follow" : "Pick a show to unfollow",
        shows.map((show) => {
          const description = details(show, shows);
          return description === ""
            ? { label: clip(show.title), value: show.id }
            : { label: clip(show.title), value: show.id, description: clip(description) };
        }),
      ),
    ),
  ]);
