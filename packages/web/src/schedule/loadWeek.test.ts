import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect } from "effect";

import { weekWindow } from "./loadWeek.ts";

describe("weekWindow", () => {
  it.effect(
    "ends at local midnight when the clocks change during the week",
    Effect.fn(function* () {
      const { from, to } = yield* weekWindow(DateTime.makeUnsafe("2027-03-25T12:00:00Z"), "Europe/Oslo");
      expect(DateTime.formatIso(from)).toBe("2027-03-24T23:00:00.000Z");
      expect(DateTime.formatIso(to)).toBe("2027-03-31T22:00:00.000Z");
    }),
  );

  it.effect(
    "ends at next week's midnight when today's midnight was skipped",
    Effect.fn(function* () {
      const { from, to } = yield* weekWindow(DateTime.makeUnsafe("2026-09-06T12:00:00Z"), "America/Santiago");
      expect(DateTime.formatIso(from)).toBe("2026-09-06T04:00:00.000Z");
      expect(DateTime.formatIso(to)).toBe("2026-09-13T03:00:00.000Z");
    }),
  );
});
