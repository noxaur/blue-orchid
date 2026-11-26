import { DiscordConfig, DiscordRoutes, makeDiscordMessenger } from "@blue-orchid/discord";
import { CatalogSource, Messengers, ScheduleSources } from "@blue-orchid/core";
import { SourceUnavailable } from "@blue-orchid/domain";
import { makeTheTvdbCatalog, makeTheTvdbSchedule } from "@blue-orchid/source-thetvdb";
import { Effect, Layer, Option, Redacted } from "effect";
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http";
import { env } from "void/env";

import { StoreLive } from "./store.ts";

const discordSettings =
  env.DISCORD_APPLICATION_ID !== undefined &&
  env.DISCORD_PUBLIC_KEY !== undefined &&
  env.DISCORD_BOT_TOKEN !== undefined
    ? Option.some({
        applicationId: env.DISCORD_APPLICATION_ID,
        publicKey: env.DISCORD_PUBLIC_KEY,
        botToken: Redacted.make(env.DISCORD_BOT_TOKEN),
      })
    : Option.none();

const DiscordConfigLive = Layer.succeed(DiscordConfig, discordSettings);

/** One messenger per platform. A new platform in domain's Platform is a type error here until it has one. */
const MessengersLive = Layer.effect(
  Messengers,
  Effect.gen(function* () {
    return Messengers.of({ discord: yield* makeDiscordMessenger });
  }),
);

const theTvdbKey = Option.fromUndefinedOr(env.THETVDB_API_KEY).pipe(Option.map(Redacted.make));

/** Schedule sources, most trusted first. See packages/core/src/ports/ScheduleSources.ts. */
const SourcesLive = Layer.effect(
  ScheduleSources,
  Effect.gen(function* () {
    return Option.isSome(theTvdbKey) ? [yield* makeTheTvdbSchedule(theTvdbKey.value)] : [];
  }),
);

/** Without THETVDB_API_KEY the catalog import fails each run and logs why, and the site keeps the shows it has. */
const CatalogSourceLive = Layer.effect(
  CatalogSource,
  Option.isSome(theTvdbKey)
    ? makeTheTvdbCatalog(theTvdbKey.value)
    : Effect.succeed(
        CatalogSource.of({
          name: "thetvdb",
          fetch: () => Effect.fail(new SourceUnavailable({ source: "thetvdb", cause: "THETVDB_API_KEY is missing." })),
        }),
      ),
);

/** Every service the app's use cases need. Routes, crons and GraphQL all run on this. */
export const AppLive = Layer.mergeAll(StoreLive, SourcesLive, CatalogSourceLive, MessengersLive).pipe(
  Layer.provideMerge(DiscordConfigLive),
  Layer.provide(FetchHttpClient.layer),
);

const HealthRoute = HttpRouter.add("GET", "/api/health", HttpServerResponse.jsonUnsafe({ ok: true }));

/** Every Effect HTTP route under /api. A chat platform's webhook routes go here. GraphQL has its own route file. */
export const RoutesLive = Layer.mergeAll(HealthRoute, DiscordRoutes);
