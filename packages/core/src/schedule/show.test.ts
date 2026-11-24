import { Show } from "@blue-orchid/domain";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Exit, Schema } from "effect";

import { frieren } from "../testing/fixtures.ts";

const withChanges = (changes: Partial<typeof Show.Encoded>) =>
  Schema.encodeEffect(Show)(frieren).pipe(
    Effect.flatMap((encoded) => Schema.decodeUnknownEffect(Show)({ ...encoded, ...changes })),
  );

describe("Show", () => {
  it.effect(
    "rejects site ids that leave out the show's own id",
    Effect.fn(function* () {
      expect(Exit.isSuccess(yield* Effect.exit(withChanges({})))).toBe(true);
      expect(Exit.isFailure(yield* Effect.exit(withChanges({ siteIds: ["myanimelist:52991"] })))).toBe(true);
    }),
  );

  it.effect(
    "ends an episode its length after it airs, and has no end when the length is unknown",
    Effect.fn(function* () {
      const airsAt = DateTime.makeUnsafe("2026-01-09T15:00:00Z");
      expect(frieren.endsAt(airsAt)).toEqual(DateTime.makeUnsafe("2026-01-09T15:24:00Z"));
      const unknownLength = yield* withChanges({ episodeMinutes: null });
      expect(unknownLength.endsAt(airsAt)).toBeNull();
    }),
  );
});
