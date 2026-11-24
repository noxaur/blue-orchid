# Discord

The bot and Discord sign-in are optional. Without all three `DISCORD_` values, the interactions route answers 503
and the rest of the site works.

## Set up

Put the values from Discord's developer portal in `apps/tracker/.env` locally, or set them as
[secrets](deploying.md#secrets) in production:

```ini
DISCORD_APPLICATION_ID=
DISCORD_PUBLIC_KEY=
DISCORD_BOT_TOKEN=
AUTH_DISCORD_CLIENT_ID=
AUTH_DISCORD_CLIENT_SECRET=
```

Set the portal's Interactions Endpoint URL to `https://<host>/api/discord/interactions`. The portal holds that
path, so renaming the route cuts the bot off until the portal is updated.

## Register commands

Discord shows only the slash commands it was last sent. After a command in `packages/core/src/chat/commands/`
changes, send them:

```sh
pnpm --filter @blue-orchid/tracker discord:register
```

With a real `.env`, this replaces the live bot's commands for everyone.
