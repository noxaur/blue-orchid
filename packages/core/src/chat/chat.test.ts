import { ChatIdentity, ShowId } from "@blue-orchid/domain";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect } from "effect";

import { frieren, release, show as showWith } from "../testing/fixtures.ts";
import { makeInMemory } from "../testing/InMemory.ts";
import { actions } from "./actions.ts";
import { commands } from "./commands/index.ts";

const caller = new ChatIdentity({ platform: "discord", userId: "42" });

const sequel = showWith({
  id: ShowId.make("anilist:182255"),
  title: "Frieren: Beyond Journey's End Season 2",
  siteIds: [ShowId.make("anilist:182255")],
});

/** it.effect starts the clock at the epoch, so "the next seven days" are the first days of 1970. */
const soon = DateTime.makeUnsafe("1970-01-02T12:00:00Z");

describe("commands", () => {
  it("fit every platform's limits", () => {
    for (const [name, command] of Object.entries(commands)) {
      expect(name, "lowercase, 1-32 characters").toMatch(/^[a-z][a-z0-9-]{0,31}$/);
      expect(command.description.length, `${name} description`).toBeLessThanOrEqual(100);
      for (const option of command.options) {
        expect(option.name).toMatch(/^[a-z][a-z0-9-]{0,31}$/);
        expect(option.description.length).toBeLessThanOrEqual(100);
        expect(option.choices.length).toBeLessThanOrEqual(25);
      }
    }
  });

  it.effect(
    "follow then following lists the show with its next episode",
    Effect.fn(function* () {
      const next = release({ airsAt: soon });
      const memory = yield* makeInMemory({ shows: [frieren], releases: [next] });
      const followed = yield* commands.follow.invoke({ show: "frieren" }, caller).pipe(Effect.provide(memory.layer));
      expect(followed).toEqual({ _tag: "Followed", show: frieren, next });
      const list = yield* commands.following.invoke({}, caller).pipe(Effect.provide(memory.layer));
      expect(list).toEqual({ _tag: "Following", shows: [{ show: frieren, next }] });
    }),
  );

  it.effect(
    "asks which show when a title matches several, and follows an exact title at once",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({ shows: [frieren, sequel] });
      const several = yield* commands.follow.invoke({ show: "frieren" }, caller).pipe(Effect.provide(memory.layer));
      expect(several).toEqual({ _tag: "Choose", action: "follow", query: "frieren", shows: [frieren, sequel] });
      const exact = yield* commands.follow.invoke({ show: frieren.title }, caller).pipe(Effect.provide(memory.layer));
      expect(exact).toMatchObject({ _tag: "Followed", show: frieren });
    }),
  );

  it.effect(
    "asks which one when two shows share the exact title",
    Effect.fn(function* () {
      const twin = showWith({ id: ShowId.make("anilist:9"), siteIds: [ShowId.make("anilist:9")] });
      const memory = yield* makeInMemory({ shows: [frieren, twin] });
      const answer = yield* commands.follow.invoke({ show: frieren.title }, caller).pipe(Effect.provide(memory.layer));
      expect(answer).toMatchObject({ _tag: "Choose", shows: [frieren, twin] });
      yield* actions.follow.invoke([frieren.id], caller).pipe(Effect.provide(memory.layer));
      yield* actions.follow.invoke([twin.id], caller).pipe(Effect.provide(memory.layer));
      const off = yield* commands.unfollow.invoke({ show: frieren.title }, caller).pipe(Effect.provide(memory.layer));
      expect(off).toMatchObject({ _tag: "Choose", action: "unfollow" });
    }),
  );

  it.effect(
    "lists only followed shows by default, and every show with shows: all",
    Effect.fn(function* () {
      const mine = release({ airsAt: soon });
      const other = release({ showId: sequel.id, airsAt: soon });
      const memory = yield* makeInMemory({ shows: [frieren, sequel], releases: [mine, other] });
      yield* actions.follow.invoke([frieren.id], caller).pipe(Effect.provide(memory.layer));
      const following = yield* commands.schedule.invoke({}, caller).pipe(Effect.provide(memory.layer));
      expect(following).toEqual({ _tag: "Schedule", scope: "following", releases: [{ show: frieren, release: mine }] });
      const all = yield* commands.schedule.invoke({ shows: "all" }, caller).pipe(Effect.provide(memory.layer));
      expect(all).toMatchObject({ _tag: "Schedule", scope: "all", releases: [{ show: frieren }, { show: sequel }] });
    }),
  );

  it.effect(
    "unfollow matches only followed shows",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({ shows: [frieren, sequel] });
      yield* actions.follow.invoke([sequel.id], caller).pipe(Effect.provide(memory.layer));
      const done = yield* commands.unfollow.invoke({ show: "frieren" }, caller).pipe(Effect.provide(memory.layer));
      expect(done).toEqual({ _tag: "Unfollowed", show: sequel, wasFollowing: true });
      const none = yield* commands.unfollow.invoke({ show: "frieren" }, caller).pipe(Effect.provide(memory.layer));
      expect(none).toEqual({ _tag: "NoMatch", query: "frieren" });
    }),
  );

  it.effect(
    "answers instead of failing when an option is missing or nothing matches",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({ shows: [frieren] });
      const missing = yield* commands.follow.invoke({}, caller).pipe(Effect.provide(memory.layer));
      expect(missing).toEqual({ _tag: "MissingOption", names: ["show"] });
      const none = yield* commands.follow.invoke({ show: "naruto" }, caller).pipe(Effect.provide(memory.layer));
      expect(none).toEqual({ _tag: "NoMatch", query: "naruto" });
    }),
  );
});

describe("actions", () => {
  it.effect(
    "unfollow then follow again by id, and unfollow several from the list",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({ shows: [frieren, sequel] });
      yield* actions.follow.invoke([frieren.id], caller).pipe(Effect.provide(memory.layer));
      const off = yield* actions.unfollow.invoke([frieren.id], caller).pipe(Effect.provide(memory.layer));
      expect(off).toEqual({ _tag: "Unfollowed", show: frieren, wasFollowing: true });
      const on = yield* actions.follow.invoke([frieren.id], caller).pipe(Effect.provide(memory.layer));
      expect(on).toEqual({ _tag: "Followed", show: frieren, next: undefined });

      yield* actions.follow.invoke([sequel.id], caller).pipe(Effect.provide(memory.layer));
      const rest = yield* actions.unfollowMany
        .invoke([frieren.id, sequel.id], caller)
        .pipe(Effect.provide(memory.layer));
      expect(rest).toEqual({ _tag: "Following", shows: [] });
    }),
  );

  it.effect(
    "answers trouble for a show that is no longer in the catalog",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({ shows: [] });
      const gone = yield* actions.follow.invoke([frieren.id], caller).pipe(Effect.provide(memory.layer));
      expect(gone).toEqual({ _tag: "Trouble" });
    }),
  );
});
