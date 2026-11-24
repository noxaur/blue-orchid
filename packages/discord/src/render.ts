import type { Reply, ReplyKind } from "@blue-orchid/core";
import type { APIContainerComponent } from "discord-api-types/v10";
import { Match } from "effect";

import { accent, clip, escape, notice } from "./views/blocks.ts";
import { chooseView } from "./views/choose.ts";
import { followedView } from "./views/followed.ts";
import { followingView } from "./views/following.ts";
import { scheduleView } from "./views/schedule.ts";
import { showUpdateView } from "./views/showUpdate.ts";
import { unfollowedView } from "./views/unfollowed.ts";

type Views = { readonly [K in ReplyKind]: (reply: Extract<Reply, { _tag: K }>) => APIContainerComponent };

/** One view per kind of reply. Each lives in its own file under views/, so a layout changes in one place. */
const views: Views = {
  Schedule: scheduleView,
  Followed: followedView,
  Unfollowed: unfollowedView,
  Choose: chooseView,
  NoMatch: ({ query }) =>
    notice(accent.neutral, `No show matches “${escape(clip(query, 200))}”`, "Try the English or Japanese title."),
  Following: followingView,
  ShowUpdate: showUpdateView,
  MissingOption: ({ names }) => notice(accent.neutral, `Missing ${names.join(", ")}`, "Fill it in and try again."),
  Trouble: () => notice(accent.error, "Something went wrong on our side", "Try again in a minute."),
};

/** A reply as the components of a Components V2 message. */
export const renderReply = (reply: Reply): Array<APIContainerComponent> => [Match.valueTags(reply, views)];
