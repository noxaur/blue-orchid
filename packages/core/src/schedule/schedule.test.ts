import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect } from "effect";
import { TestClock } from "effect/testing";

import { frieren, release } from "../testing/fixtures.ts";
import { makeInMemory } from "../testing/InMemory.ts";
import { nextRelease } from "./schedule.ts";

const at = (iso: string) => DateTime.makeUnsafe(iso);

describe("nextRelease", () => {
  it.effect(
    "is the earliest release that has not aired, and none once all have aired",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({
        shows: [frieren],
        releases: [
          release({ episode: 3, airsAt: at("2026-01-23T15:00:00Z") }),
          release({ episode: 1, airsAt: at("2026-01-09T15:00:00Z") }),
          release({ episode: 2, airsAt: at("2026-01-16T15:00:00Z") }),
        ],
      });
      yield* TestClock.setTime(DateTime.toEpochMillis(at("2026-01-10T00:00:00Z")));
      expect((yield* nextRelease(frieren.id).pipe(Effect.provide(memory.layer)))?.episode).toBe(2);

      yield* TestClock.setTime(DateTime.toEpochMillis(at("2026-02-01T00:00:00Z")));
      expect(yield* nextRelease(frieren.id).pipe(Effect.provide(memory.layer))).toBeUndefined();
    }),
  );
});
