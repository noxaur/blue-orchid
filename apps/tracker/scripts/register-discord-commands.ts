import { DiscordConfig, registerCommands } from "@blue-orchid/discord";
import { commands } from "@blue-orchid/core";
import { Effect, Exit, Layer, Option, Redacted } from "effect";
import { FetchHttpClient } from "effect/http";

/** Run after changing a command in packages/core/src/chat/commands/: `pnpm --filter @blue-orchid/tracker discord:register`. */
const { DISCORD_APPLICATION_ID, DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN } = process.env;

const settings =
  DISCORD_APPLICATION_ID !== undefined && DISCORD_PUBLIC_KEY !== undefined && DISCORD_BOT_TOKEN !== undefined
    ? Option.some({
        applicationId: DISCORD_APPLICATION_ID,
        publicKey: DISCORD_PUBLIC_KEY,
        botToken: Redacted.make(DISCORD_BOT_TOKEN),
      })
    : Option.none();

void registerCommands(commands)
  .pipe(
    Effect.provide(Layer.merge(Layer.succeed(DiscordConfig, settings), FetchHttpClient.layer)),
    Effect.tap(() => Effect.logInfo(`Registered ${Object.keys(commands).length} commands with Discord.`)),
    Effect.tapError((error) => Effect.logError(error.message)),
    Effect.runPromiseExit,
  )
  .then((exit) => {
    process.exitCode = Exit.isSuccess(exit) ? 0 : 1;
  });
