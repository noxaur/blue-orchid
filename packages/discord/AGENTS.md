# discord

Discord's side of the chat commands and DMs. Imports `core`, `domain`, `discord-api-types` and `effect`.
Commands and actions live in `packages/core/src/chat/`; this package only translates. Run
`pnpm --filter @blue-orchid/tracker discord:register` after a command changes.

- Every message is Components V2: one container per reply, drawn by that reply's view in `src/views/`. Change a
  layout there; `src/render.ts` only picks the view.
- A button's custom id is `action:showId` and a menu's is `action` with show ids as values. A press answers with
  `UpdateMessage`, so the reply replaces the message the control was on.
- Times are `<t:…>` timestamps, so each reader sees their own zone. Never write a time out as text.
- `src/render.test.ts` holds every view to Discord's 40 components and 4,000 characters.
