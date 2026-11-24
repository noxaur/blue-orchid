# discord

Discord's side of the chat commands and DMs. Imports `core`, `domain`, `discord-api-types` and `effect`.
Commands themselves live in `packages/core/src/chat/commands.ts`; this package only translates. Run
`pnpm --filter @blue-orchid/tracker discord:register` after a command changes.
