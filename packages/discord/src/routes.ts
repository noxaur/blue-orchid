import type { CommandServices } from "@blue-orchid/core";
import { Effect, Option, Schema } from "effect";
import type { HttpServerRequest } from "effect/http";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { DiscordConfig } from "./DiscordConfig.ts";
import { InteractionFromJson, respond } from "./interaction.ts";
import { verifySignature } from "./verify.ts";

export const interactionsPath = "/api/discord/interactions";

const handle = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.gen(function* () {
    const settings = yield* DiscordConfig;
    if (Option.isNone(settings)) {
      return HttpServerResponse.text("Discord is not set up on this server.", { status: 503 });
    }
    const body = yield* request.text;
    const valid = yield* verifySignature({
      publicKey: settings.value.publicKey,
      signature: request.headers["x-signature-ed25519"] ?? "",
      timestamp: request.headers["x-signature-timestamp"] ?? "",
      body,
    });
    if (!valid) {
      return HttpServerResponse.text("Bad request signature.", { status: 401 });
    }
    const interaction = yield* Schema.decodeUnknownEffect(InteractionFromJson)(body);
    return HttpServerResponse.jsonUnsafe(yield* respond(interaction));
  }).pipe(
    Effect.catchTags({
      SchemaError: () => Effect.succeed(HttpServerResponse.text("Unreadable interaction.", { status: 400 })),
      HttpServerError: () => Effect.succeed(HttpServerResponse.text("Unreadable request.", { status: 400 })),
    }),
  );

/**
 * The endpoint Discord posts slash commands to. Set it as the Interactions Endpoint URL in the developer portal.
 * The services are taken when the layer is built, so each request needs nothing extra.
 */
export const DiscordRoutes = HttpRouter.use(
  Effect.fn("Discord.addRoutes")(function* (router) {
    const services = yield* Effect.context<CommandServices | DiscordConfig>();
    yield* router.add("POST", interactionsPath, (request) => handle(request).pipe(Effect.provideContext(services)));
  }),
);
