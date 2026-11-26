import { defineEnv, string } from "void/env";

/**
 * Every server value the app reads. Locally they come from .env, in production from `void secret put`.
 * They are optional so the site runs without Discord; Discord answers 503 until all three DISCORD_ values are set.
 * Without THETVDB_API_KEY the crons import no shows and sync no releases.
 */
export default defineEnv({
  DISCORD_APPLICATION_ID: string().optional(),
  DISCORD_PUBLIC_KEY: string().optional(),
  DISCORD_BOT_TOKEN: string().optional(),
  AUTH_DISCORD_CLIENT_ID: string().optional(),
  AUTH_DISCORD_CLIENT_SECRET: string().optional(),
  THETVDB_API_KEY: string().optional(),
});
