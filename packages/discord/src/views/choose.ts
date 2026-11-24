import type { Reply } from "@blue-orchid/core";

import { accent, clip, container, escape, row, showFacts, showMenu, text } from "./blocks.ts";

/** C3: the title matched several shows, so the person picks one. */
export const chooseView = ({ action, query, shows }: Extract<Reply, { _tag: "Choose" }>) =>
  container(accent.reply, [
    text(`### Which one?\n-# Shows matching “${escape(clip(query, 200))}”`),
    row(
      showMenu(
        action,
        action === "follow" ? "Pick a show to follow" : "Pick a show to unfollow",
        shows.map((show) => {
          const facts = showFacts(show);
          return facts === ""
            ? { label: clip(show.title), value: show.id }
            : { label: clip(show.title), value: show.id, description: clip(facts) };
        }),
      ),
    ),
  ]);
