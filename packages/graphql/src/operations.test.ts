import { frieren, makeInMemory, release } from "@blue-orchid/core/testing";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Schema } from "effect";
import { execute, parse, validate } from "graphql";

import type { GraphQLContext } from "./context.ts";
import { operations, ScheduleQuery, ShowQuery } from "./operations.ts";
import { schema } from "./schema.ts";

describe("operations", () => {
  for (const operation of operations) {
    it(`${operation.name} is valid against the schema`, () => {
      expect(validate(schema, parse(operation.document)).map((error) => error.message)).toEqual([]);
    });
  }

  it.effect(
    "Schedule's result schema decodes what the server answers",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({ shows: [frieren], releases: [release()] });
      const contextValue: GraphQLContext = {
        run: (effect) => Effect.runPromise(effect.pipe(Effect.provide(memory.layer))),
        viewer: null,
      };
      const answer = yield* Effect.promise(() =>
        Promise.resolve(
          execute({
            schema,
            document: parse(ScheduleQuery.document),
            variableValues: { from: "2026-01-05T00:00:00Z", to: "2026-01-12T00:00:00Z" },
            contextValue,
          }),
        ),
      );
      expect(answer.errors).toBeUndefined();
      const decoded = yield* Schema.decodeUnknownEffect(ScheduleQuery.result)(answer.data);
      expect(decoded.schedule.map((row) => row.show.title)).toEqual([frieren.title]);
      expect(DateTime.formatIso(decoded.schedule[0]!.release.airsAt)).toBe("2026-01-09T15:00:00.000Z");
    }),
  );

  it.effect(
    "Show's result schema decodes a show found by another site's id, with its releases",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({
        shows: [frieren],
        releases: [
          release({ episode: 1 }),
          release({ episode: 2, airsAt: DateTime.makeUnsafe("2026-01-16T15:00:00Z") }),
        ],
      });
      const contextValue: GraphQLContext = {
        run: (effect) => Effect.runPromise(effect.pipe(Effect.provide(memory.layer))),
        viewer: null,
      };
      const answer = yield* Effect.promise(() =>
        Promise.resolve(
          execute({
            schema,
            document: parse(ShowQuery.document),
            variableValues: { id: "myanimelist:52991" },
            contextValue,
          }),
        ),
      );
      expect(answer.errors).toBeUndefined();
      const show = (yield* Schema.decodeUnknownEffect(ShowQuery.result)(answer.data)).show;
      expect(show?.id).toBe(frieren.id);
      expect(show?.releases.map((row) => row.release.episode)).toEqual([1, 2]);
      expect(DateTime.formatIso(show!.releases[0]!.endsAt!)).toBe("2026-01-09T15:24:00.000Z");
    }),
  );

  it.effect(
    "rejects a window longer than 31 days with a client error",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({});
      const answer = yield* Effect.promise(() =>
        Promise.resolve(
          execute({
            schema,
            document: parse(ScheduleQuery.document),
            variableValues: { from: "2026-01-01T00:00:00Z", to: "2026-03-01T00:00:00Z" },
            contextValue: {
              run: (effect) => Effect.runPromise(effect.pipe(Effect.provide(memory.layer))),
              viewer: null,
            } satisfies GraphQLContext,
          }),
        ),
      );
      expect(answer.errors?.[0]?.extensions["code"]).toBe("BAD_USER_INPUT");
    }),
  );
});
