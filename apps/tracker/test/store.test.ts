import { readdirSync, readFileSync } from "node:fs";

import type { Messengers } from "@blue-orchid/core";
import { Catalog, deliverNotifications, ScheduleSources, Subscriptions, syncSchedule } from "@blue-orchid/core";
import { frieren, makeInMemory, release, show as showWith } from "@blue-orchid/core/testing";
import { ChatIdentity, releaseKey, Show, ShowId, Update, UpdateId } from "@blue-orchid/domain";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { createDb } from "void/db";

import { makeStore } from "../server/store.ts";

const migrations = new URL("../db/migrations/", import.meta.url);

/** The store on a fresh local D1, the one `pnpm dev` runs, with every migration applied. */
const localStore = Effect.acquireRelease(
  Effect.promise(async () => {
    const miniflare = new Miniflare(
      convertV4MiniflareOptions({ modules: true, script: "export default {}", d1Databases: ["DB"] }),
    );
    const d1 = await miniflare.getD1Database("DB");
    for (const file of readdirSync(migrations)
      .filter((name) => name.endsWith(".sql"))
      .toSorted()) {
      const statements = readFileSync(new URL(file, migrations), "utf8")
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);
      await d1.batch(statements.map((statement) => d1.prepare(statement)));
    }
    return { miniflare, store: makeStore(createDb(d1)) };
  }),
  ({ miniflare }) => Effect.promise(() => miniflare.dispose()),
).pipe(Effect.map(({ store }) => store));

const reader = new ChatIdentity({ platform: "discord", userId: "1001" });
const at = (iso: string) => DateTime.makeUnsafe(iso);

const show = (id: string, siteIds: ReadonlyArray<string> = []) =>
  new Show({
    id: ShowId.make(id),
    title: `Show ${id}`,
    imageUrl: null,
    episodes: null,
    format: null,
    status: null,
    season: null,
    year: null,
    startDate: null,
    endDate: null,
    episodeMinutes: null,
    siteIds: [id, ...siteIds].map((site) => ShowId.make(site)),
  });

describe("store on D1", () => {
  it.effect(
    "syncs and delivers a moved episode to a follower once, and a second run changes nothing",
    Effect.fn(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(at("2026-01-05T00:00:00Z")));
      const store = yield* localStore;
      const memory = yield* makeInMemory({});
      const moved = release({ airsAt: at("2026-01-09T16:30:00Z") });
      const source = ScheduleSources.layer([
        { name: "fake", fetch: () => Effect.succeed({ shows: [frieren], releases: [moved] }) },
      ]);
      const run = <A, E>(effect: Effect.Effect<A, E, Catalog | Subscriptions | ScheduleSources | Messengers>) =>
        effect.pipe(Effect.provide(store), Effect.provide(Layer.merge(memory.layer, source)));

      yield* run(
        Catalog.use((catalog) =>
          catalog.save({ shows: [frieren], releases: [{ release: release(), revision: 0 }], updates: [] }),
        ),
      );
      yield* run(Subscriptions.use((subscriptions) => subscriptions.follow(reader, frieren.id)));

      expect(yield* run(syncSchedule())).toEqual({ sources: 1, failedSources: 0, releases: 1, updates: 1 });
      yield* run(deliverNotifications());
      expect(yield* run(syncSchedule())).toEqual({ sources: 1, failedSources: 0, releases: 1, updates: 0 });
      yield* run(deliverNotifications());

      expect((yield* memory.sent).map((sent) => sent.userId)).toEqual(["1001"]);
      const stored = yield* run(Catalog.use((catalog) => catalog.releasesByKey([releaseKey(moved)])));
      expect(stored.map((row) => DateTime.formatIso(row.release.airsAt))).toEqual(["2026-01-09T16:30:00.000Z"]);
    }),
  );

  it.effect(
    "claims each delivery for one of two overlapping runs",
    Effect.fn(function* () {
      const store = yield* localStore;
      const now = yield* DateTime.now;
      const change = { _tag: "EpisodeScheduled" as const, release: release() };
      const deliveries = yield* Effect.gen(function* () {
        const catalog = yield* Catalog;
        const subscriptions = yield* Subscriptions;
        yield* catalog.save({ shows: [frieren], releases: [], updates: [] });
        yield* subscriptions.follow(reader, frieren.id);
        yield* catalog.save({
          shows: [],
          releases: [{ release: change.release, revision: 1 }],
          updates: [new Update({ id: UpdateId.make("u1"), detectedAt: now, change })],
        });
        return yield* Effect.all([subscriptions.claim(10), subscriptions.claim(10)], { concurrency: 2 });
      }).pipe(Effect.provide(store));
      expect(deliveries.flat().map((delivery) => delivery.update.id)).toEqual(["u1"]);
    }),
  );

  it.effect(
    "keeps the newer time when an overlapping sync saves an older revision of a release",
    Effect.fn(function* () {
      const store = yield* localStore;
      const newer = release({ airsAt: at("2026-01-09T17:00:00Z") });
      const stored = yield* Effect.gen(function* () {
        const catalog = yield* Catalog;
        yield* catalog.save({ shows: [frieren], releases: [{ release: newer, revision: 2 }], updates: [] });
        yield* catalog.save({ shows: [], releases: [{ release: release(), revision: 1 }], updates: [] });
        return yield* catalog.releasesByKey([releaseKey(newer)]);
      }).pipe(Effect.provide(store));
      expect(stored.map((row) => [DateTime.formatIso(row.release.airsAt), row.revision])).toEqual([
        ["2026-01-09T17:00:00.000Z", 2],
      ]);
    }),
  );

  it.effect(
    "finds a show by any of its site ids, and a site id two shows claim goes to the one saved last",
    Effect.fn(function* () {
      const store = yield* localStore;
      const found = yield* Effect.gen(function* () {
        const catalog = yield* Catalog;
        yield* catalog.save({ shows: [frieren], releases: [], updates: [] });
        const before = yield* catalog.show(ShowId.make("myanimelist:52991"));
        yield* catalog.save({ shows: [show("kitsu:1", ["myanimelist:52991"])], releases: [], updates: [] });
        const after = yield* catalog.show(ShowId.make("myanimelist:52991"));
        return { before, after };
      }).pipe(Effect.provide(store));
      expect(found.before.id).toBe(frieren.id);
      expect(found.before.siteIds).toEqual(["anilist:154587", "myanimelist:52991"]);
      expect(found.after.id).toBe("kitsu:1");
    }),
  );

  it.effect(
    "saves a catalog slice's 1,000 shows, and more releases than one statement can bind",
    Effect.fn(function* () {
      const store = yield* localStore;
      const shows = Array.from({ length: 1000 }, (_, index) => show(`anilist:${index}`, [`myanimelist:${index}`]));
      const releases = shows.slice(0, 30).flatMap((each) =>
        Array.from({ length: 10 }, (_, episode) => ({
          release: release({ showId: each.id, episode: episode + 1 }),
          revision: 0,
        })),
      );
      const stored = yield* Effect.gen(function* () {
        const catalog = yield* Catalog;
        yield* catalog.save({ shows, releases, updates: [] });
        return {
          releases: yield* catalog.releasesBetween(at("2026-01-01T00:00:00Z"), at("2026-02-01T00:00:00Z")),
          last: yield* catalog.show(ShowId.make("myanimelist:999")),
        };
      }).pipe(Effect.provide(store));
      expect(stored.releases).toHaveLength(300);
      expect(stored.last.id).toBe("anilist:999");
    }),
  );

  it.effect(
    "finds each show's next release in one call, leaving out shows with none",
    Effect.fn(function* () {
      const store = yield* localStore;
      const other = showWith({ id: ShowId.make("anilist:2"), siteIds: [ShowId.make("anilist:2")], title: "Other" });
      const quiet = showWith({ id: ShowId.make("anilist:3"), siteIds: [ShowId.make("anilist:3")], title: "Quiet" });
      const rows = [
        release({ episode: 1, airsAt: at("2026-01-01T15:00:00Z") }),
        release({ episode: 3, airsAt: at("2026-01-16T15:00:00Z") }),
        release({ episode: 2, airsAt: at("2026-01-09T15:00:00Z") }),
        release({ showId: other.id, episode: 5, airsAt: at("2026-01-10T15:00:00Z") }),
      ];
      const next = yield* Catalog.use((catalog) =>
        catalog
          .save({
            shows: [frieren, other, quiet],
            releases: rows.map((row) => ({ release: row, revision: 0 })),
            updates: [],
          })
          .pipe(Effect.andThen(catalog.nextReleases([frieren.id, other.id, quiet.id], at("2026-01-05T00:00:00Z")))),
      ).pipe(Effect.provide(store));
      expect([...next].map(([id, row]) => [id, row.episode])).toEqual([
        [frieren.id, 2],
        [other.id, 5],
      ]);
    }),
  );

  it.effect(
    "stops several follows in one call, and only the caller's",
    Effect.fn(function* () {
      const store = yield* localStore;
      const other = showWith({ id: ShowId.make("anilist:2"), siteIds: [ShowId.make("anilist:2")], title: "Other" });
      const someoneElse = new ChatIdentity({ platform: "discord", userId: "2002" });
      const result = yield* Effect.gen(function* () {
        const catalog = yield* Catalog;
        const subscriptions = yield* Subscriptions;
        yield* catalog.save({ shows: [frieren, other], releases: [], updates: [] });
        yield* subscriptions.follow(reader, frieren.id);
        yield* subscriptions.follow(reader, other.id);
        yield* subscriptions.follow(someoneElse, frieren.id);
        const removed = yield* subscriptions.unfollow(reader, [frieren.id, other.id, ShowId.make("anilist:404")]);
        const again = yield* subscriptions.unfollow(reader, [frieren.id]);
        return {
          removed,
          again,
          mine: yield* subscriptions.followed(reader),
          theirs: yield* subscriptions.followed(someoneElse),
        };
      }).pipe(Effect.provide(store));
      expect(result.removed).toBe(2);
      expect(result.again).toBe(0);
      expect(result.mine).toEqual([]);
      expect(result.theirs.map((followedShow) => followedShow.id)).toEqual([frieren.id]);
    }),
  );
});
