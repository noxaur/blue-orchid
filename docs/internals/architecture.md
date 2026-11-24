# Architecture

One Void app on Cloudflare Workers serves everything: the website's files, the API and the bot, and it runs the
cron jobs. Every surface reads from our own D1 database. None of them calls a schedule source while serving.

**A website visit.** The browser loads the single-page app. A route loader sends a GraphQL operation from
`packages/graphql/src/operations.ts` to `/api/graphql`. The resolver runs a core use case through the app's
runtime, and the use case reads the Catalog port, which `apps/tracker/server/store.ts` implements on D1.

**A slash command.** Discord posts to `/api/discord/interactions`. The Discord adapter verifies the signature,
runs the matching command from `packages/core/src/chat/commands/`, and renders its reply with that reply's view in
`packages/discord/src/views/`. Commands never fail: every error becomes a reply. A button or menu in a reply runs a
core action from `packages/core/src/chat/actions.ts`, and its reply replaces the message the control was on.

**Sync, every 30 minutes.** `sync-schedule` asks each schedule source for the next five weeks and records an
update for each release that is new or has moved. Each release counts its changes in `revision`, and an update's
id is the release key plus the revision it made. A release and its update are saved in one D1 batch, so a failed
run saves neither and the retry finds the same change again.

**Delivery, every 5 minutes.** `deliver-notifications` claims up to 100 unsent deliveries with a conditional
upsert, so overlapping runs never send the same one, then sends each as a DM. A send that fails for now is retried
once its 15-minute claim runs out, up to five tries. One that can never succeed, such as a user who blocks DMs from
the bot, is given up at once. Neither holds up the deliveries behind it.
