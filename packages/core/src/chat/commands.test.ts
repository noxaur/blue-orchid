import { ChatIdentity } from "@blue-orchid/domain";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { frieren } from "../testing/fixtures.ts";
import { makeInMemory } from "../testing/InMemory.ts";
import { commands } from "./commands.ts";

const caller = new ChatIdentity({ platform: "discord", userId: "42" });

describe("commands", () => {
  it("fit every platform's limits", () => {
    for (const [name, command] of Object.entries(commands)) {
      expect(name, "lowercase, 1-32 characters").toMatch(/^[a-z][a-z0-9-]{0,31}$/);
      expect(command.description.length, `${name} description`).toBeLessThanOrEqual(100);
      for (const option of command.options) {
        expect(option.name).toMatch(/^[a-z][a-z0-9-]{0,31}$/);
        expect(option.description.length).toBeLessThanOrEqual(100);
      }
    }
  });

  it.effect(
    "follow then following lists the show",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({ shows: [frieren] });
      const followed = yield* commands.follow.invoke({ show: "frieren" }, caller).pipe(Effect.provide(memory.layer));
      expect(followed.text).toBe(`You now follow ${frieren.title}.`);
      const list = yield* commands.following.invoke({}, caller).pipe(Effect.provide(memory.layer));
      expect(list.text).toBe(`You follow: ${frieren.title}.`);
    }),
  );

  it.effect(
    "answers instead of failing when an option is missing or nothing matches",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({ shows: [frieren] });
      const missing = yield* commands.follow.invoke({}, caller).pipe(Effect.provide(memory.layer));
      expect(missing.text).toBe("Missing show.");
      const none = yield* commands.unfollow.invoke({ show: "naruto" }, caller).pipe(Effect.provide(memory.layer));
      expect(none.text).toBe('No show matches "naruto".');
    }),
  );
});
