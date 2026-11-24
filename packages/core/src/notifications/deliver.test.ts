import { ChatIdentity, Update, UpdateId } from "@blue-orchid/domain";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Duration, Effect } from "effect";
import { TestClock } from "effect/testing";

import { Catalog } from "../ports/Catalog.ts";
import { claimLease, maxAttempts, Subscriptions } from "../ports/Subscriptions.ts";
import { frieren, release } from "../testing/fixtures.ts";
import { makeInMemory } from "../testing/InMemory.ts";
import { deliverNotifications } from "./deliver.ts";

const fan = (userId: string) => new ChatIdentity({ platform: "discord", userId });

const setup = Effect.fn("setup")(function* (followers: ReadonlyArray<string>, failFor = new Map<string, boolean>()) {
  const memory = yield* makeInMemory({ shows: [frieren], failFor });
  yield* Effect.gen(function* () {
    const subscriptions = yield* Subscriptions;
    yield* Effect.forEach(followers, (userId) => subscriptions.follow(fan(userId), frieren.id));
    const now = yield* DateTime.now;
    const change = { _tag: "EpisodeScheduled" as const, release: release() };
    yield* Catalog.use((catalog) =>
      catalog.save({
        shows: [],
        releases: [{ release: change.release, revision: 1 }],
        updates: [new Update({ id: UpdateId.make("u1"), detectedAt: now, change })],
      }),
    );
  }).pipe(Effect.provide(memory.layer));
  return memory;
});

describe("deliverNotifications", () => {
  it.effect(
    "sends once when two runs overlap",
    Effect.fn(function* () {
      const memory = yield* setup(["1"]);
      yield* Effect.all([deliverNotifications(), deliverNotifications()], { concurrency: 2 }).pipe(
        Effect.provide(memory.layer),
      );
      expect(yield* memory.sent).toHaveLength(1);
    }),
  );

  it.effect(
    "gives up a permanent failure without blocking the next follower",
    Effect.fn(function* () {
      const memory = yield* setup(["blocked", "2"], new Map([["blocked", true]]));
      yield* deliverNotifications().pipe(Effect.provide(memory.layer));
      yield* TestClock.adjust(Duration.sum(claimLease, Duration.seconds(1)));
      const report = yield* deliverNotifications().pipe(Effect.provide(memory.layer));
      expect((yield* memory.sent).map((sent) => sent.userId)).toEqual(["2"]);
      expect(report.attempted).toBe(0);
    }),
  );

  it.effect(
    "retries a failure for now after the lease, up to the attempt limit",
    Effect.fn(function* () {
      const memory = yield* setup(["flaky"], new Map([["flaky", false]]));
      const attempts = [];
      for (let run = 0; run < maxAttempts + 2; run++) {
        attempts.push((yield* deliverNotifications().pipe(Effect.provide(memory.layer))).attempted);
        yield* TestClock.adjust(Duration.sum(claimLease, Duration.seconds(1)));
      }
      expect(attempts).toEqual([...Array.from({ length: maxAttempts }, () => 1), 0, 0]);
    }),
  );

  it.effect(
    "stops reclaiming a delivery whose runs keep dying before they report",
    Effect.fn(function* () {
      const memory = yield* setup(["1"]);
      const claims = [];
      for (let run = 0; run < maxAttempts + 2; run++) {
        claims.push((yield* Subscriptions.use((s) => s.claim(10)).pipe(Effect.provide(memory.layer))).length);
        yield* TestClock.adjust(Duration.sum(claimLease, Duration.seconds(1)));
      }
      expect(claims).toEqual([...Array.from({ length: maxAttempts }, () => 1), 0, 0]);
    }),
  );
});
