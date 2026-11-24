import type { ChatIdentity, Show, ShowId } from "@blue-orchid/domain";
import { ShowNotFound } from "@blue-orchid/domain";
import { DateTime, Effect } from "effect";

import { Catalog } from "../ports/Catalog.ts";
import { Subscriptions } from "../ports/Subscriptions.ts";

/** As many shows as a person can choose between in one reply. */
export const choiceLimit = 25;

/**
 * Narrows shows that contain a title to the one it means: the only show with exactly that title, or the only
 * show at all. Otherwise all of them stay, for the person to choose from.
 */
export const narrowByTitle = (shows: ReadonlyArray<Show>, title: string): ReadonlyArray<Show> => {
  const exact = shows.filter((show) => show.title.toLowerCase() === title.toLowerCase());
  return exact.length === 1 ? exact : shows;
};

export const matchShow = Effect.fn("Follows.matchShow")(function* (title: string) {
  const catalog = yield* Catalog;
  const shows = yield* catalog.searchShows(title, choiceLimit);
  if (shows.length === 0) {
    return yield* new ShowNotFound({ query: title });
  }
  return narrowByTitle(shows, title);
});

/** Reads everything before saving, so a failed read never leaves a follow the reply says didn't happen. */
export const follow = Effect.fn("Follows.follow")(function* (identity: ChatIdentity, id: ShowId) {
  const catalog = yield* Catalog;
  const subscriptions = yield* Subscriptions;
  const show = yield* catalog.show(id);
  const next = yield* catalog.nextRelease(show.id, yield* DateTime.now);
  yield* subscriptions.follow(identity, show.id);
  return { show, next };
});

export const unfollow = Effect.fn("Follows.unfollow")(function* (identity: ChatIdentity, id: ShowId) {
  const catalog = yield* Catalog;
  const subscriptions = yield* Subscriptions;
  const show = yield* catalog.show(id);
  const removed = yield* subscriptions.unfollow(identity, [show.id]);
  return { show, wasFollowing: removed > 0 };
});

/** Stops several follows in one store call, then lists what is left. */
export const unfollowMany = Effect.fn("Follows.unfollowMany")(function* (
  identity: ChatIdentity,
  ids: ReadonlyArray<ShowId>,
) {
  const subscriptions = yield* Subscriptions;
  yield* subscriptions.unfollow(identity, ids);
  return yield* followedWithNext(identity);
});

export const followed = Effect.fn("Follows.followed")(function* (identity: ChatIdentity) {
  const subscriptions = yield* Subscriptions;
  return yield* subscriptions.followed(identity);
});

/** The shows the identity follows, each with its next release, in two store calls however many there are. */
export const followedWithNext = Effect.fn("Follows.followedWithNext")(function* (identity: ChatIdentity) {
  const catalog = yield* Catalog;
  const shows = yield* followed(identity);
  const next = yield* catalog.nextReleases(
    shows.map((show) => show.id),
    yield* DateTime.now,
  );
  return shows.map((show) => ({ show, next: next.get(show.id) }));
});
