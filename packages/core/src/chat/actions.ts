import type { ChatIdentity, ShowId } from "@blue-orchid/domain";
import { Effect } from "effect";

import { follow, unfollow, unfollowMany } from "../follows/follows.ts";
import type { CommandServices } from "./command.ts";
import type { Reply } from "./Reply.ts";
import { trouble } from "./Reply.ts";

/**
 * What a button or menu in a reply does, by name. Platforms put the name and the chosen show ids on the control
 * and hand them back here when it is pressed. Like commands, actions answer instead of failing.
 */
export interface ChatAction {
  readonly invoke: (shows: ReadonlyArray<ShowId>, caller: ChatIdentity) => Effect.Effect<Reply, never, CommandServices>;
}

/** A show id comes from our own message, so a missing show is as unexpected as a store failure. */
const answer = <E>(effect: Effect.Effect<Reply, E, CommandServices>) =>
  effect.pipe(Effect.orElseSucceed(() => trouble));

const missingShow: Reply = { _tag: "MissingOption", names: ["show"] };

export const actions = {
  follow: {
    invoke: ([show], caller) =>
      show === undefined
        ? Effect.succeed(missingShow)
        : answer(follow(caller, show).pipe(Effect.map((result): Reply => ({ _tag: "Followed", ...result })))),
  },
  unfollow: {
    invoke: ([show], caller) =>
      show === undefined
        ? Effect.succeed(missingShow)
        : answer(unfollow(caller, show).pipe(Effect.map((result): Reply => ({ _tag: "Unfollowed", ...result })))),
  },
  /** Unfollows every chosen show and answers with the shorter list. */
  unfollowMany: {
    invoke: (shows, caller) =>
      answer(unfollowMany(caller, shows).pipe(Effect.map((rest): Reply => ({ _tag: "Following", shows: rest })))),
  },
} satisfies Record<string, ChatAction>;

export type ActionName = keyof typeof actions;

export const isActionName = (name: string): name is ActionName => Object.hasOwn(actions, name);
