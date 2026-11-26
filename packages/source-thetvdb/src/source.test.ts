import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Redacted } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

import { makeTheTvdbDetails } from "./source.ts";

/** Answers /login with a token and each /series/{id} from `series`, and records every request. */
const theTvdbAnswering = (series: Record<string, unknown>) => {
  const requests: Array<string> = [];
  const client = HttpClient.make((request, url) =>
    Effect.sync(() => {
      requests.push(`${request.method} ${url.pathname} ${request.headers["authorization"] ?? ""}`);
      if (url.pathname.endsWith("/login")) {
        return HttpClientResponse.fromWeb(request, new Response(JSON.stringify({ data: { token: "t0ken" } })));
      }
      const id = url.pathname.split("/").at(-1) ?? "";
      const body = series[id];
      return HttpClientResponse.fromWeb(
        request,
        body === undefined ? new Response("{}", { status: 404 }) : new Response(JSON.stringify({ data: body })),
      );
    }),
  );
  return { requests, layer: Layer.succeed(HttpClient.HttpClient, client) };
};

describe("makeTheTvdbDetails", () => {
  it.effect(
    "logs in once and reads each series' average runtime",
    Effect.fn(function* () {
      const tvdb = theTvdbAnswering({ "424536": { averageRuntime: 24.4 }, "1": { averageRuntime: null } });
      const source = yield* makeTheTvdbDetails(Redacted.make("key")).pipe(Effect.provide(tvdb.layer));

      expect(yield* source.fetch("424536")).toEqual({ episodeMinutes: 24 });
      expect(yield* source.fetch("1")).toEqual({ episodeMinutes: null });
      expect(tvdb.requests).toEqual([
        "POST /v4/login ",
        "GET /v4/series/424536 Bearer t0ken",
        "GET /v4/series/1 Bearer t0ken",
      ]);
    }),
  );

  it.effect(
    "answers undefined for a series TheTVDB doesn't have, and makes no request until asked",
    Effect.fn(function* () {
      const tvdb = theTvdbAnswering({});
      const source = yield* makeTheTvdbDetails(Redacted.make("key")).pipe(Effect.provide(tvdb.layer));
      expect(tvdb.requests).toEqual([]);
      expect(yield* source.fetch("999")).toBeUndefined();
    }),
  );

  it.effect(
    "fails as SourceUnavailable when TheTVDB refuses the key",
    Effect.fn(function* () {
      const client = HttpClient.make((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, new Response("{}", { status: 401 }))),
      );
      const source = yield* makeTheTvdbDetails(Redacted.make("bad")).pipe(
        Effect.provide(Layer.succeed(HttpClient.HttpClient, client)),
      );
      const error = yield* Effect.flip(source.fetch("1"));
      expect(error._tag).toBe("SourceUnavailable");
    }),
  );
});
