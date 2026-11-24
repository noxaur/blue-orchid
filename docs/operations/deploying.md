# Deploying

`main` deploys itself: after `ci` passes on a push to `main`, the `deploy` workflow runs `void deploy` for the
commit still at the tip. [Hosting](../internals/hosting.md) covers what that deploy owns.

## Secrets

Production values are set once per secret and never come from `.env`. The app reads the names in
`apps/tracker/env.ts`:

```sh
pnpm --filter @blue-orchid/tracker exec void secret put DISCORD_BOT_TOKEN
```

## Deploy by hand

Only the first deploy, or one that CI cannot make, is run by hand. It acts on the live account and its D1 data:

```sh
pnpm --filter @blue-orchid/tracker exec void deploy --platform cloudflare
```

Commit the `apps/tracker/void.lock.json` it writes. Without it, CI's deploy stops, since it cannot find the
resources the first deploy made.

## Migrations

A deploy applies every pending migration in `apps/tracker/db/migrations/`. Once applied, a migration stays: fix a
bad one with a new migration, never by editing it. Before applying, a deploy saves a D1 restore point and prints
the `void db restore` command that returns to it. A restore discards every write made after that point.
