import type { Release, Show, Update } from "@blue-orchid/domain";

import type { ScheduledRelease } from "../ports/Catalog.ts";

/** A show with its next release, if one is scheduled. */
export interface UpcomingShow {
  readonly show: Show;
  readonly next: Release | undefined;
}

/**
 * What the bot answers, as data. Core decides what to say; each platform has one view per kind and decides how
 * it looks, so a new kind is a compile error in every platform until it has a view.
 */
export type Reply =
  | {
      readonly _tag: "Schedule";
      readonly scope: "following" | "all";
      readonly releases: ReadonlyArray<ScheduledRelease>;
    }
  | { readonly _tag: "Followed"; readonly show: Show; readonly next: Release | undefined }
  | { readonly _tag: "Unfollowed"; readonly show: Show; readonly wasFollowing: boolean }
  | {
      readonly _tag: "Choose";
      readonly action: "follow" | "unfollow";
      readonly query: string;
      readonly shows: ReadonlyArray<Show>;
    }
  | { readonly _tag: "NoMatch"; readonly query: string }
  | { readonly _tag: "Following"; readonly shows: ReadonlyArray<UpcomingShow> }
  | { readonly _tag: "ShowUpdate"; readonly show: Show; readonly update: Update }
  | { readonly _tag: "MissingOption"; readonly names: ReadonlyArray<string> }
  | { readonly _tag: "Trouble" };

export type ReplyKind = Reply["_tag"];

export const trouble: Reply = { _tag: "Trouble" };
