import { makeInMemory } from "@blue-orchid/core/testing";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import type { GraphQLContext } from "./context.ts";
import { graphqlPath, makeGraphQLHandler } from "./handler.ts";
import { ViewerQuery } from "./operations.ts";

const post = (query: string) =>
  new Request(`https://tracker.test${graphqlPath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });

describe("makeGraphQLHandler", () => {
  it.effect(
    "runs the website's operations and refuses any other document",
    Effect.fn(function* () {
      const memory = yield* makeInMemory({});
      const context: GraphQLContext = {
        run: (effect) => Effect.runPromise(effect.pipe(Effect.provide(memory.layer))),
        viewer: null,
      };
      const handler = makeGraphQLHandler({ explore: false });
      const ask = (query: string) =>
        Effect.promise(() => Promise.resolve(handler.fetch(post(query), context)).then((response) => response.json()));

      expect(yield* ask(ViewerQuery.document)).toEqual({ data: { viewer: null } });
      const refused = yield* ask("{ viewer { id } }");
      expect(refused).toMatchObject({ errors: [{ extensions: { code: "OPERATION_NOT_ALLOWED" } }] });
    }),
  );
});
