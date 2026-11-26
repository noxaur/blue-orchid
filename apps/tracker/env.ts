import { defineEnv, string } from "void/env";

/**
 * Every server value the app reads. Locally they come from .env, in production from `void secret put`.
 * They are optional so the site runs without Discord; Discord answers 503 until all three DISCORD_ values are set.
 */
export default defineEnv({
  DISCORD_APPLICATION_ID: string().optional(),
  DISCORD_PUBLIC_KEY: string().optional(),
  DISCORD_BOT_TOKEN: string().optional(),
  AUTH_DISCORD_CLIENT_ID: string().optional(),
  AUTH_DISCORD_CLIENT_SECRET: string().optional(),
  /** TheTVDB API key. Without it, import-catalog skips TheTVDB. */
  TVDB_API_KEY: string().optional(),
});
