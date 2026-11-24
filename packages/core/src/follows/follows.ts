import type { ChatIdentity, Show, ShowId } from "@blue-orchid/domain";
import { ShowNotFound } from "@blue-orchid/domain";
import { DateTime, Effect } from "effect";

import { Catalog } from "../ports/Catalog.ts";
import { Subscriptions } from "../ports/Subscriptions.ts";

/** As many shows as a person can choose between in one reply. */
export const choiceLimit = 25;

/**
 * The one show a title means: an exact title match, or the only show that contains it. Otherwise every
 * candidate, best match first, for the person to choose from.
 */
export const matchShow = Effect.fn("Follows.matchShow")(function* (title: string) {
  const catalog = yield* Catalog;
  const shows = yield* catalog.searchShows(title, choiceLimit);
  if (shows.length === 0) {
    return yield* new ShowNotFound({ query: title });
  }
  const exact = shows.find((show) => show.title.toLowerCase() === title.toLowerCase());
  const [only] = shows;
  return exact !== undefined ? [exact] : shows.length === 1 && only !== undefined ? [only] : shows;
});

const withNext = Effect.fn("Follows.withNext")(function* (show: Show) {
  const catalog = yield* Catalog;
  return { show, next: yield* catalog.nextRelease(show.id, yield* DateTime.now) };
});

export const follow = Effect.fn("Follows.follow")(function* (identity: ChatIdentity, id: ShowId) {
  const catalog = yield* Catalog;
  const subscriptions = yield* Subscriptions;
  const show = yield* catalog.show(id);
  yield* subscriptions.follow(identity, show.id);
  return yield* withNext(show);
});

export const unfollow = Effect.fn("Follows.unfollow")(function* (identity: ChatIdentity, id: ShowId) {
  const catalog = yield* Catalog;
  const subscriptions = yield* Subscriptions;
  const show = yield* catalog.show(id);
  const wasFollowing = yield* subscriptions.unfollow(identity, show.id);
  return { show, wasFollowing };
});

/** The shows the identity follows, each with its next release. */
export const followed = Effect.fn("Follows.followed")(function* (identity: ChatIdentity) {
  const subscriptions = yield* Subscriptions;
  const shows = yield* subscriptions.followed(identity);
  return yield* Effect.forEach(shows, withNext);
});
