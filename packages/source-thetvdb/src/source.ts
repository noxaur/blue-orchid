import type { ShowDetailsSource } from "@blue-orchid/core";
import { SourceUnavailable } from "@blue-orchid/domain";
import { Effect, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

export const theTvdbApi = "https://api4.thetvdb.com/v4";

const Login = Schema.Struct({ data: Schema.Struct({ token: Schema.String }) });
const Series = Schema.Struct({
  data: Schema.Struct({ averageRuntime: Schema.optional(Schema.NullOr(Schema.Number)) }),
});

/** TheTVDB's series details. Logs in once, on the first lookup, so a run with nothing to fill makes no request. */
export const makeTheTvdbDetails = Effect.fn("TheTvdb.make")(function* (apiKey: Redacted.Redacted) {
  const http = yield* HttpClient.HttpClient;
  const client = http.pipe(HttpClient.filterStatusOk);
  const token = yield* Effect.cached(
    HttpClientRequest.post(`${theTvdbApi}/login`).pipe(
      HttpClientRequest.bodyJsonUnsafe({ apikey: Redacted.value(apiKey) }),
      client.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Login)),
      Effect.map((login) => login.data.token),
    ),
  );
  const fetch = Effect.fn("TheTvdb.fetch")(function* (id: string) {
    const response = yield* HttpClientRequest.get(`${theTvdbApi}/series/${encodeURIComponent(id)}`).pipe(
      HttpClientRequest.bearerToken(yield* token),
      http.execute,
    );
    if (response.status === 404) {
      return undefined;
    }
    const series = yield* HttpClientResponse.filterStatusOk(response).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Series)),
    );
    const minutes = series.data.averageRuntime;
    return { episodeMinutes: minutes !== undefined && minutes !== null && minutes > 0 ? Math.round(minutes) : null };
  });
  const source: ShowDetailsSource = {
    site: "thetvdb",
    fetch: (id) => fetch(id).pipe(Effect.mapError((cause) => new SourceUnavailable({ source: "thetvdb", cause }))),
  };
  return source;
});
