import type { ChatCommand } from "@blue-orchid/core";
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord-api-types/v10";
import type { RESTPutAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import { Effect, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import { discordApi, DiscordConfig, DiscordNotConfigured } from "./DiscordConfig.ts";

/** Core's commands as Discord slash commands. The bot is DM-first: they run only in its DMs, however it was installed. */
export const applicationCommands = (
  table: Readonly<Record<string, ChatCommand>>,
): RESTPutAPIApplicationCommandsJSONBody =>
  Object.entries(table).map(([name, command]) => ({
    type: ApplicationCommandType.ChatInput,
    name,
    description: command.description,
    integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
    contexts: [InteractionContextType.BotDM],
    options: command.options.map((option) => ({
      type: ApplicationCommandOptionType.String,
      name: option.name,
      description: option.description,
      required: option.required,
      ...(option.choices.length === 0
        ? {}
        : { choices: option.choices.map((choice) => ({ name: choice.label, value: choice.value })) }),
    })),
  }));

/** Replaces every global command with the table. Global commands can take up to an hour to appear. */
export const registerCommands = Effect.fn("Discord.registerCommands")(function* (
  table: Readonly<Record<string, ChatCommand>>,
) {
  const settings = yield* DiscordConfig;
  if (Option.isNone(settings)) {
    return yield* new DiscordNotConfigured();
  }
  const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
  yield* HttpClientRequest.put(`${discordApi}/applications/${settings.value.applicationId}/commands`).pipe(
    HttpClientRequest.setHeader("Authorization", `Bot ${Redacted.value(settings.value.botToken)}`),
    HttpClientRequest.bodyJsonUnsafe(applicationCommands(table)),
    client.execute,
  );
});
