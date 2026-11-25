import { DiscordConfig, DiscordRoutes, makeDiscordMessenger } from "@blue-orchid/discord";
import { Messengers, ScheduleSources } from "@blue-orchid/core";
import { makeSyoboiSchedule } from "@blue-orchid/source-syoboi";
import { WikidataCatalogLive } from "@blue-orchid/source-wikidata";
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

/** Schedule sources, most trusted first. See packages/core/src/ports/ScheduleSources.ts. */
const SourcesLive = Layer.effect(
  ScheduleSources,
  Effect.gen(function* () {
    return [yield* makeSyoboiSchedule()];
  }),
);

/** Every service the app's use cases need. Routes, crons and GraphQL all run on this. */
export const AppLive = Layer.mergeAll(StoreLive, SourcesLive, WikidataCatalogLive, MessengersLive).pipe(
  Layer.provideMerge(DiscordConfigLive),
  Layer.provide(FetchHttpClient.layer),
);

const HealthRoute = HttpRouter.add("GET", "/api/health", HttpServerResponse.jsonUnsafe({ ok: true }));

/** Every Effect HTTP route under /api. A chat platform's webhook routes go here. GraphQL has its own route file. */
export const RoutesLive = Layer.mergeAll(HealthRoute, DiscordRoutes);
