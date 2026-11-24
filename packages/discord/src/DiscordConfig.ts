import type { Option, Redacted } from "effect";
import { Context, Schema } from "effect";

export interface DiscordSettings {
  readonly applicationId: string;
  readonly publicKey: string;
  readonly botToken: Redacted.Redacted;
}

/** None when the server has no Discord credentials: the endpoint answers 503 and messages stay pending. */
export class DiscordConfig extends Context.Service<DiscordConfig, Option.Option<DiscordSettings>>()(
  "orchid/discord/DiscordConfig",
) {}

export const discordApi = "https://discord.com/api/v10";

export class DiscordNotConfigured extends Schema.TaggedError<DiscordNotConfigured>()("DiscordNotConfigured", {}) {
  override get message() {
    return "Set DISCORD_APPLICATION_ID, DISCORD_PUBLIC_KEY and DISCORD_BOT_TOKEN first.";
  }
}
