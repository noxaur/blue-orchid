import type { ChatIdentity, Release, ShowId, Update } from "@blue-orchid/domain";
import { MessageNotSent, releaseKey, Show, ShowNotFound } from "@blue-orchid/domain";
import { DateTime, Effect, Layer, Ref } from "effect";

import type { Reply } from "../chat/Reply.ts";
import type { StoredRelease } from "../ports/Catalog.ts";
import { Catalog } from "../ports/Catalog.ts";
import { Messengers } from "../ports/Messengers.ts";
import type { PendingDelivery } from "../ports/Subscriptions.ts";
import { claimLease, maxAttempts, Subscriptions } from "../ports/Subscriptions.ts";

interface Follow {
  readonly identity: ChatIdentity;
  readonly show: ShowId;
  readonly since: DateTime.Utc;
}

interface Delivery {
  readonly status: "claimed" | "sent" | "failed";
  readonly attempts: number;
  readonly claimedAt: DateTime.Utc;
}

export interface SentMessage {
  readonly userId: string;
  readonly reply: Reply;
}

const identityKey = (identity: ChatIdentity) => `${identity.platform}:${identity.userId}`;
const deliveryKey = (update: string, identity: ChatIdentity) => `${update}|${identityKey(identity)}`;

/**
 * In-memory Catalog, Subscriptions and Messengers for tests. `sent` holds every message the messengers sent.
 * `failFor` makes sends to a user id fail: `true` permanently, `false` for now.
 */
export const makeInMemory = Effect.fn("InMemory.make")(function* (seed: {
  readonly shows?: ReadonlyArray<Show>;
  readonly releases?: ReadonlyArray<Release>;
  readonly failFor?: ReadonlyMap<string, boolean>;
}) {
  const shows = yield* Ref.make(new Map((seed.shows ?? []).map((show) => [show.id, show])));
  const releases = yield* Ref.make(
    new Map<string, StoredRelease>(
      (seed.releases ?? []).map((release) => [releaseKey(release), { release, revision: 0 }]),
    ),
  );
  const updates = yield* Ref.make(new Map<string, Update>());
  const follows = yield* Ref.make<ReadonlyArray<Follow>>([]);
  const deliveries = yield* Ref.make(new Map<string, Delivery>());
  const sent = yield* Ref.make<ReadonlyArray<SentMessage>>([]);

  const catalog = Catalog.of({
    releasesBetween: Effect.fn("InMemory.releasesBetween")(function* (from, to) {
      const byId = yield* Ref.get(shows);
      const all = yield* Ref.get(releases);
      return [...all.values()]
        .map((row) => row.release)
        .filter(
          (release) => DateTime.isGreaterThanOrEqualTo(release.airsAt, from) && DateTime.isLessThan(release.airsAt, to),
        )
        .toSorted((a, b) => DateTime.toEpochMillis(a.airsAt) - DateTime.toEpochMillis(b.airsAt))
        .flatMap((release) => {
          const show = byId.get(release.showId);
          return show === undefined ? [] : [{ show, release }];
        });
    }),
    show: (id) =>
      Ref.get(shows).pipe(
        Effect.flatMap((byId) => {
          const show = byId.get(id) ?? [...byId.values()].find((candidate) => candidate.siteIds.includes(id));
          return show === undefined ? Effect.fail(new ShowNotFound({ query: id })) : Effect.succeed(show);
        }),
      ),
    showReleases: (id) =>
      Ref.get(releases).pipe(
        Effect.map((all) =>
          [...all.values()]
            .map((row) => row.release)
            .filter((release) => release.showId === id)
            .toSorted((a, b) => DateTime.toEpochMillis(a.airsAt) - DateTime.toEpochMillis(b.airsAt)),
        ),
      ),
    nextRelease: (id, from) =>
      Ref.get(releases).pipe(
        Effect.map((all) =>
          [...all.values()]
            .map((row) => row.release)
            .filter((release) => release.showId === id && DateTime.isGreaterThanOrEqualTo(release.airsAt, from))
            .toSorted((a, b) => DateTime.toEpochMillis(a.airsAt) - DateTime.toEpochMillis(b.airsAt))
            .at(0),
        ),
      ),
    nextReleases: (ids, from) =>
      Ref.get(releases).pipe(
        Effect.map((all) => {
          const next = new Map<ShowId, Release>();
          for (const { release } of [...all.values()].toSorted(
            (a, b) => DateTime.toEpochMillis(a.release.airsAt) - DateTime.toEpochMillis(b.release.airsAt),
          )) {
            if (
              ids.includes(release.showId) &&
              DateTime.isGreaterThanOrEqualTo(release.airsAt, from) &&
              !next.has(release.showId)
            ) {
              next.set(release.showId, release);
            }
          }
          return next;
        }),
      ),
    searchShows: (title, limit) =>
      Ref.get(shows).pipe(
        Effect.map((byId) =>
          [...byId.values()].filter((show) => show.title.toLowerCase().includes(title.toLowerCase())).slice(0, limit),
        ),
      ),
    releasesByKey: (keys) => Ref.get(releases).pipe(Effect.map((all) => keys.flatMap((key) => all.get(key) ?? []))),
    ownersOf: (siteIds) =>
      Ref.get(shows).pipe(
        Effect.map((byId) => {
          const wanted = new Set(siteIds);
          return new Map(
            [...byId.values()].flatMap((show) =>
              show.siteIds.filter((siteId) => wanted.has(siteId)).map((siteId) => [siteId, show.id] as const),
            ),
          );
        }),
      ),
    save: Effect.fn("InMemory.save")(function* (changes) {
      yield* Ref.update(shows, (byId) => {
        const next = new Map([...byId, ...changes.shows.map((show) => [show.id, show] as const)]);
        for (const show of changes.showsIfMissing ?? []) {
          const stored = next.get(show.id);
          // Like the database: a known show keeps its details and gains only the site ids nobody has yet.
          const owned = new Set([...next.values()].flatMap((each) => each.siteIds));
          const added = show.siteIds.filter((siteId) => !owned.has(siteId));
          next.set(
            show.id,
            stored === undefined
              ? show
              : new Show({
                  id: stored.id,
                  title: stored.title,
                  imageUrl: stored.imageUrl,
                  episodes: stored.episodes,
                  format: stored.format,
                  status: stored.status,
                  season: stored.season,
                  year: stored.year,
                  startDate: stored.startDate,
                  endDate: stored.endDate,
                  episodeMinutes: stored.episodeMinutes,
                  siteIds: [...stored.siteIds, ...added],
                }),
          );
        }
        return next;
      });
      const runAt = changes.updates[0]?.detectedAt;
      const known = yield* Ref.get(updates);
      // Like the database: only the next revision, and never over a revision a later run stored.
      const next = yield* Ref.updateAndGet(releases, (all) => {
        const accepted = changes.releases.filter((row) => {
          const stored = all.get(releaseKey(row.release));
          if (stored === undefined) {
            return true;
          }
          const storedAt = known.get(`${releaseKey(row.release)}:r${stored.revision}`)?.detectedAt;
          return (
            row.revision === stored.revision + 1 &&
            (runAt === undefined || storedAt === undefined || DateTime.isLessThanOrEqualTo(storedAt, runAt))
          );
        });
        return new Map([...all, ...accepted.map((row) => [releaseKey(row.release), row] as const)]);
      });
      const revisions = new Map(changes.releases.map((row) => [releaseKey(row.release), row.revision]));
      yield* Ref.update(
        updates,
        (all) =>
          new Map([
            ...all,
            ...changes.updates
              .filter((update) => {
                const key = releaseKey(update.change.release);
                const stored = next.get(key);
                return (
                  !all.has(update.id) &&
                  stored !== undefined &&
                  stored.revision === revisions.get(key) &&
                  DateTime.Equivalence(stored.release.airsAt, update.change.release.airsAt)
                );
              })
              .map((update) => [update.id, update] as const),
          ]),
      );
    }),
  });

  const subscriptions = Subscriptions.of({
    follow: Effect.fn("InMemory.follow")(function* (identity, show) {
      const since = yield* DateTime.now;
      yield* Ref.update(follows, (all) =>
        all.some((f) => identityKey(f.identity) === identityKey(identity) && f.show === show)
          ? all
          : [...all, { identity, show, since }],
      );
    }),
    unfollow: (identity, showIds) =>
      Ref.modify(follows, (all) => {
        const rest = all.filter(
          (f) => !(identityKey(f.identity) === identityKey(identity) && showIds.includes(f.show)),
        );
        return [all.length - rest.length, rest];
      }),
    followed: Effect.fn("InMemory.followed")(function* (identity) {
      const byId = yield* Ref.get(shows);
      const all = yield* Ref.get(follows);
      return all
        .filter((f) => identityKey(f.identity) === identityKey(identity))
        .flatMap((f) => byId.get(f.show) ?? []);
    }),
    claim: Effect.fn("InMemory.claim")(function* (limit) {
      const now = yield* DateTime.now;
      const byId = yield* Ref.get(shows);
      const allUpdates = [...(yield* Ref.get(updates)).values()].toSorted(
        (a, b) => DateTime.toEpochMillis(a.detectedAt) - DateTime.toEpochMillis(b.detectedAt),
      );
      const allFollows = yield* Ref.get(follows);
      return yield* Ref.modify(deliveries, (current) => {
        const claimable = (key: string) => {
          const delivery = current.get(key);
          return (
            delivery === undefined ||
            (delivery.status === "claimed" &&
              delivery.attempts < maxAttempts &&
              DateTime.isLessThanOrEqualTo(DateTime.addDuration(delivery.claimedAt, claimLease), now))
          );
        };
        const picked: Array<PendingDelivery> = allUpdates
          .flatMap((update) =>
            allFollows
              .filter(
                (f) =>
                  update.change.release.showId === f.show &&
                  DateTime.isGreaterThanOrEqualTo(update.detectedAt, f.since) &&
                  claimable(deliveryKey(update.id, f.identity)),
              )
              .flatMap((f) => {
                const show = byId.get(f.show);
                return show === undefined ? [] : [{ identity: f.identity, show, update }];
              }),
          )
          .slice(0, limit);
        const next = new Map(current);
        for (const { update, identity } of picked) {
          const key = deliveryKey(update.id, identity);
          next.set(key, { status: "claimed", attempts: (current.get(key)?.attempts ?? 0) + 1, claimedAt: now });
        }
        return [picked, next];
      });
    }),
    markSent: (update, identity) =>
      Ref.update(deliveries, (current) => {
        const key = deliveryKey(update, identity);
        const delivery = current.get(key);
        return delivery === undefined ? current : new Map(current).set(key, { ...delivery, status: "sent" });
      }),
    markFailed: (update, identity, permanent) =>
      Ref.update(deliveries, (current) => {
        const key = deliveryKey(update, identity);
        const delivery = current.get(key);
        return delivery !== undefined && (permanent || delivery.attempts >= maxAttempts)
          ? new Map(current).set(key, { ...delivery, status: "failed" })
          : current;
      }),
  });

  const recording = {
    send: (userId: string, reply: Reply) => {
      const permanent = seed.failFor?.get(userId);
      return permanent === undefined
        ? Ref.update(sent, (all) => [...all, { userId, reply }])
        : Effect.fail(new MessageNotSent({ platform: "test", permanent, cause: "failFor" }));
    },
  };
  const messengers = Messengers.of({ discord: recording });

  return {
    layer: Layer.mergeAll(
      Layer.succeed(Catalog, catalog),
      Layer.succeed(Subscriptions, subscriptions),
      Layer.succeed(Messengers, messengers),
    ),
    sent: Ref.get(sent),
    updates: Ref.get(updates).pipe(Effect.map((all) => [...all.values()])),
  };
});
