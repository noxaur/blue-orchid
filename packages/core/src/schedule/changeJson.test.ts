import { ChangeJson } from "@blue-orchid/domain";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Schema } from "effect";

import { release } from "../testing/fixtures.ts";

describe("ChangeJson", () => {
  it.effect(
    "survives a trip through stored text",
    Effect.fn(function* () {
      const change = {
        _tag: "EpisodeRescheduled" as const,
        release: release(),
        previousAirsAt: DateTime.makeUnsafe(0),
      };
      const text = yield* Schema.encodeEffect(ChangeJson)(change);
      const back = yield* Schema.decodeEffect(ChangeJson)(text);
      expect(back._tag === "EpisodeRescheduled" && DateTime.formatIso(back.previousAirsAt)).toBe(
        "1970-01-01T00:00:00.000Z",
      );
      expect(DateTime.Equivalence(back.release.airsAt, change.release.airsAt)).toBe(true);
    }),
  );
});
