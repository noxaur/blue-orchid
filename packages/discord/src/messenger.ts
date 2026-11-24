import type { Messenger } from "@blue-orchid/core";
import { MessageNotSent } from "@blue-orchid/domain";
import { Effect, Option, Redacted, Schema } from "effect";
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http";

import { discordApi, DiscordConfig } from "./DiscordConfig.ts";
import { renderMessage } from "./render.ts";

const DmChannel = Schema.Struct({ id: Schema.String });

/** Discord answers 403 when the user blocks DMs from the bot or shares no server with it, and 404 for an unknown user. */
const permanentStatuses: ReadonlySet<number> = new Set([403, 404]);

const isPermanent = (cause: unknown) =>
  cause instanceof HttpClientError.HttpClientError &&
  cause.reason._tag === "StatusCodeError" &&
  permanentStatuses.has(cause.reason.response.status);

const notSent = (cause: unknown) =>
  cause instanceof MessageNotSent
    ? cause
    : new MessageNotSent({ platform: "discord", permanent: isPermanent(cause), cause });

/** Sends a DM: open (or reuse) the DM channel, then post to it. */
export const makeDiscordMessenger = Effect.gen(function* () {
  const settings = yield* DiscordConfig;
  const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

  const messenger: Messenger = {
    send: (userId, message) =>
      Effect.gen(function* () {
        if (Option.isNone(settings)) {
          return yield* Effect.fail(
            new MessageNotSent({
              platform: "discord",
              permanent: false,
              cause: "Discord is not set up: DISCORD_BOT_TOKEN is missing.",
            }),
          );
        }
        const authorized = HttpClientRequest.setHeader(
          "Authorization",
          `Bot ${Redacted.value(settings.value.botToken)}`,
        );
        const channel = yield* HttpClientRequest.post(`${discordApi}/users/@me/channels`).pipe(
          authorized,
          HttpClientRequest.bodyJsonUnsafe({ recipient_id: userId }),
          client.execute,
          Effect.flatMap(HttpClientResponse.schemaBodyJson(DmChannel)),
        );
        yield* HttpClientRequest.post(`${discordApi}/channels/${channel.id}/messages`).pipe(
          authorized,
          HttpClientRequest.bodyJsonUnsafe({ content: renderMessage(message), allowed_mentions: { parse: [] } }),
          client.execute,
        );
      }).pipe(Effect.mapError(notSent)),
  };
  return messenger;
});
