import type { CommandServices } from "@blue-orchid/core";
import { commands, isCommandName, textMessage } from "@blue-orchid/core";
import { ChatIdentity } from "@blue-orchid/domain";
import { InteractionResponseType, InteractionType, MessageFlags } from "discord-api-types/v10";
import type { APIInteractionResponse } from "discord-api-types/v10";
import { Effect, Schema } from "effect";

import { renderMessage } from "./render.ts";

const Interaction = Schema.Struct({
  type: Schema.Enum(InteractionType),
  data: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String,
      options: Schema.optionalKey(Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.Unknown }))),
    }),
  ),
  user: Schema.optionalKey(Schema.Struct({ id: Schema.String })),
  member: Schema.optionalKey(Schema.Struct({ user: Schema.Struct({ id: Schema.String }) })),
});
type Interaction = typeof Interaction.Type;

export const InteractionFromJson = Schema.fromJsonString(Interaction);

/** Answers to these commands are visible to the whole channel. All others only to the person who asked. */
const publicCommands: ReadonlySet<string> = new Set(["schedule"]);

const reply = (content: string, visibleToAll: boolean): APIInteractionResponse => ({
  type: InteractionResponseType.ChannelMessageWithSource,
  data: visibleToAll
    ? { content, allowed_mentions: { parse: [] } }
    : { content, allowed_mentions: { parse: [] }, flags: MessageFlags.Ephemeral },
});

export const respond = Effect.fn("Discord.respond")(function* (
  interaction: Interaction,
): Effect.fn.Return<APIInteractionResponse, never, CommandServices> {
  if (interaction.type === InteractionType.Ping) {
    return { type: InteractionResponseType.Pong };
  }
  const userId = interaction.user?.id ?? interaction.member?.user.id;
  const name = interaction.data?.name;
  if (interaction.type !== InteractionType.ApplicationCommand || userId === undefined || name === undefined) {
    return reply("This bot only answers slash commands.", false);
  }
  if (!isCommandName(name)) {
    return reply(renderMessage(textMessage(`Unknown command /${name}.`)), false);
  }
  const args = Object.fromEntries(
    (interaction.data?.options ?? []).map((option) => [
      option.name,
      typeof option.value === "string" ? option.value : "",
    ]),
  );
  const message = yield* commands[name].invoke(args, new ChatIdentity({ platform: "discord", userId }));
  return reply(renderMessage(message), publicCommands.has(name));
});
