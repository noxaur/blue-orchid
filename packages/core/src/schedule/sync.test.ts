import { ChatIdentity, releaseKey, SourceUnavailable } from "@blue-orchid/domain";
import type { Release } from "@blue-orchid/domain";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Ref } from "effect";
import { TestClock } from "effect/testing";

import { deliverNotifications } from "../notifications/deliver.ts";
import { ScheduleSources } from "../ports/ScheduleSources.ts";
import { Catalog } from "../ports/Catalog.ts";
import { Subscriptions } from "../ports/Subscriptions.ts";
import { frieren, release } from "../testing/fixtures.ts";
import { makeInMemory } from "../testing/InMemory.ts";
import { syncSchedule } from "./sync.ts";

const reader = new ChatIdentity({ platform: "discord", userId: "1001" });
const at = (iso: string) => DateTime.makeUnsafe(iso);

/** A source whose answer the test changes between runs. */
const makeSource = Effect.fn("makeSource")(function* (initial: Release) {
  const current = yield* Ref.make(initial);
  const layer = ScheduleSources.layer([
    { name: "broken", fetch: () => Effect.fail(new SourceUnavailable({ source: "broken", cause: "down" })) },
    { name: "fake", fetch: () => Ref.get(current).pipe(Effect.map((r) => ({ shows: [frieren], releases: [r] }))) },
  ]);
  return { layer, move: (iso: string) => Ref.set(current, release({ airsAt: at(iso) })) };
});

describe("syncSchedule then deliverNotifications", () => {
  it.effect(
    "tells a follower once when an episode moves",
    Effect.fn(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(at("2026-01-05T00:00:00Z")));
      const memory = yield* makeInMemory({ shows: [frieren], releases: [release()] });
      const source = yield* makeSource(release({ airsAt: at("2026-01-09T16:30:00Z") }));
      const layer = Layer.merge(memory.layer, source.layer);

      yield* Subscriptions.use((subscriptions) => subscriptions.follow(reader, frieren.id)).pipe(Effect.provide(layer));
      const report = yield* syncSchedule().pipe(Effect.provide(layer));
      expect(report).toEqual({ sources: 2, failedSources: 1, releases: 1, updates: 1 });

      yield* deliverNotifications().pipe(Effect.provide(layer));
      yield* syncSchedule().pipe(Effect.provide(layer));
      yield* deliverNotifications().pipe(Effect.provide(layer));

      const sent = yield* memory.sent;
      expect(sent).toHaveLength(1);
      expect(sent[0]?.userId).toBe("1001");
      expect(sent[0]?.reply).toMatchObject({ _tag: "ShowUpdate", update: { change: { _tag: "EpisodeRescheduled" } } });
    }),
  );

  it.effect(
    "records every move, even back to an earlier time",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({
        shows: [frieren],
        releases: [release({ airsAt: at("2026-01-09T15:00:00Z") })],
      });
      const source = yield* makeSource(release({ airsAt: at("2026-01-09T16:00:00Z") }));
      const layer = Layer.merge(memory.layer, source.layer);
      yield* syncSchedule().pipe(Effect.provide(layer));
      yield* source.move("2026-01-09T15:00:00Z");
      yield* syncSchedule().pipe(Effect.provide(layer));
      yield* source.move("2026-01-09T16:00:00Z");
      yield* syncSchedule().pipe(Effect.provide(layer));
      expect((yield* memory.updates).map((update) => update.id)).toHaveLength(3);
    }),
  );

  it.effect(
    "keeps the first of two saves of the same revision, so the release matches its update",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({ shows: [frieren], releases: [release()] });
      const save = (iso: string) =>
        Catalog.use((catalog) =>
          catalog.save({ shows: [], releases: [{ release: release({ airsAt: at(iso) }), revision: 1 }], updates: [] }),
        ).pipe(Effect.provide(memory.layer));
      yield* save("2026-01-09T16:00:00Z");
      yield* save("2026-01-09T17:00:00Z");
      const [stored] = yield* Catalog.use((catalog) => catalog.releasesByKey([releaseKey(release())])).pipe(
        Effect.provide(memory.layer),
      );
      expect(stored && DateTime.formatIso(stored.release.airsAt)).toBe("2026-01-09T16:00:00.000Z");
    }),
  );
});
