---
name: adding-a-chat-platform
description: Use when adding a chat platform the bot runs on, such as Telegram, Slack or WhatsApp.
---

A platform is a translator. The commands, follows and messages already exist in core; the new package turns them
into the platform's format and back. `packages/chat-discord` is the model to copy.

1. **Ask the user** to approve a new package, `packages/chat-<platform>`, and its npm dependencies. Prefer plain `fetch` through Effect's `HttpClient` over an SDK.
2. **Add the platform** to `Platform` in `packages/domain/src/ChatIdentity.ts`. Done when `pnpm check` fails at every place that must handle it, starting with `Messengers` in `apps/tracker/server/AppLive.ts`.
3. **Create the package** and add it to `tools/lint/dependency-cruiser.cjs`, with the same allowances as `chat-discord`. Give it an AGENTS.md.
4. **Inbound.** An `HttpRouter` layer for the platform's webhook under `/api/<platform>/`, which verifies the request, runs `commands[name].invoke(args, identity)` and renders the reply. Copy `packages/chat-discord/src/routes.ts`. Done when a test sends a signed request through `HttpRouter.toWebHandler` and gets the reply, as in `routes.test.ts`.
5. **Outbound.** A `Messenger` that sends a direct message, with failures as `MessageNotSent`. Copy `packages/chat-discord/src/messenger.ts`.
6. **Render.** Turn a core `Message` into the platform's format within its length limit. Show each `at` in the reader's timezone if the platform can; otherwise in UTC with the zone named.
7. **Wire it.** Add the routes to `RoutesLive` and the messenger to `Messengers` in `apps/tracker/server/AppLive.ts`. Add its secrets to `apps/tracker/env.ts` as optional values, and read them only in `AppLive.ts`.
8. **Gate.** Run `pnpm check`. Done when it passes.
