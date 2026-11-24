# blue-orchid

blue-orchid is an anime release tracker: what airs this week, at what time where you are, and a message when a
show you follow changes. Follow from the Discord bot with no account, or sign in to hear by email and other
channels too. People use the website and the bot; agents use the API.

## What makes blue-orchid special

We can't compromise on these.

- **Every change, once, before it airs:** each change to a show, from a moved episode to a sequel announcement,
  becomes exactly one update, and each update reaches a follower exactly once, through retries, overlapping runs
  and crashes. Updates may be bundled, but a bundle is timed to the follower's zone and lands before the release
  it is about. Faster is welcome, never at the price of a duplicate, a lost update or a late one.
- **Your time, your week:** every release time is shown in the reader's zone, or in one they pick such as JST,
  and a week is seven local calendar days, even where clocks skip midnight. Nobody converts a time in their head.
- **Our own catalog:** every surface, agents through the API included, reads our own stored catalog and never
  calls a schedule source while serving. We link out to other platforms and import from them, such as a watch
  list; showing the schedule never waits on them.

## General principles

- Channel your inner DRY, YAGNI, KISS and SOLID.
- Build on the shared layer each area already has. If it can't do what you need, extend it there.
- Write real fixes, not bypasses. Every check failure prints its fix; follow it instead of loosening the rule.
- Keep code in one function unless a part is reused or composable. Extract a helper only when it names a real concept.
- Validate unknown values once, at the boundary that owns them, and pass typed values inward.
- Before adding complexity for a speculative or vanishingly unlikely race or edge case, explain the concrete
  failure mode, likelihood and complexity cost to the user and get their buy-in. Sync and delivery are the
  exception: they run late, repeat and overlap by design, so their races are real.
- If a short request has two possible meanings, ask one question before you start.
- Call a bug fixed only when a test, log or recording shows it.
- Ask the user before adding a package, an npm dependency or a cloud resource, and before changing a rule in
  `vite.config.ts`, `tools/lint/dependency-cruiser.cjs` or `tools/lint/orchid.ts`. A rule that seems wrong is a question,
  not an edit.

## How it works

One Void app on Cloudflare serves the website, the API and the bot, and runs three crons: `import-catalog` refreshes
shows from the catalog source, `sync-schedule` writes releases and updates into D1, `deliver-notifications` sends
them. Dependencies point inward: `apps/tracker` →
adapters (`graphql`, `discord`, `source-anilist`, `web`) → `core` → `domain`. `tools/lint/dependency-cruiser.cjs` holds what each
package may import, and `docs/internals/architecture.md` traces a request and a cron run.

| Directory                 | What it is                                                   | Read first                          |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| `packages/domain`         | Schemas, branded ids, tagged errors                          | `packages/domain/AGENTS.md`         |
| `packages/core`           | Use cases, ports, chat commands, jobs, in-memory fakes       | `packages/core/AGENTS.md`           |
| `packages/graphql`        | The API (Pothos, Yoga) and the website's operations          | `packages/graphql/AGENTS.md`        |
| `packages/discord`        | Discord slash commands and DMs                               | `packages/discord/AGENTS.md`        |
| `packages/source-anilist` | AniList as the catalog source                                | `packages/source-anilist/AGENTS.md` |
| `packages/web`            | The website (React, TanStack Router)                         | `packages/web/AGENTS.md`            |
| `apps/tracker`            | The Void app: wiring, database, routes, crons, auth, deploys | `apps/tracker/AGENTS.md`            |
| `infra`                   | The Alchemy stack, for cloud resources Void does not own     | `docs/internals/hosting.md`         |

Code is Effect v4 throughout: `Effect.fn` for functions, `Context.Service` for services, `Schema.TaggedError` for
errors, `yield* DateTime.now` for time. Effects run only in the composition roots that the root `vite.config.ts`
lists. Your memory of Effect v3 is wrong here: read `packages/core/node_modules/effect/ai-docs/` and the source.
Void's docs for the installed version are in `apps/tracker/node_modules/void/docs/`.

## Hazards

1. **Deploying.** `void deploy` and `void secret put` act on the live Cloudflare account and its D1 data. Run
   them only when the user asks; `pnpm dev` and its local D1 are for trying things.
2. **Shipping a migration.** A migration in `apps/tracker/db/migrations/` is permanent once deployed. Change
   `db/schema.ts`, run `db:generate`, and read the SQL before committing. Never edit a committed migration; add a
   new one.
3. **Registering commands.** `discord:register` with a real `apps/tracker/.env` replaces the live bot's slash
   commands for everyone. Run it only after a command change the user wants live.
4. **Moving the interactions route.** Discord's developer portal holds `/api/discord/interactions`. Renaming the
   route silently cuts the bot off until the portal is updated, so leave it in place unless the user asks.
5. **Upgrading Alchemy.** v2 is beta, pinned to an exact version, and breaks every week or two. Upgrade it only
   as its own change, on purpose.

## Docs

- Agents read the code, so most changes need no doc.
- Record a decision in `docs/internals/decisions.md` only when it is hard to reverse, surprising without context
  and the result of a real trade-off. If any of the three is missing, skip it.
- A decision record is one concise paragraph: the context, the decision and why.
- State each fact once, in the doc that owns it. Delete what a change makes stale in the same change.
- New terms go in `docs/internals/glossary.md`, and code uses exactly that word.

## Checks

- `pnpm check` is the gate. Work is done when it passes. The pre-commit hook and CI (`mise run check`) run it,
  and the Claude Code Stop hook runs it whenever the worktree is dirty, so a red gate keeps you working.
- A rule is a check whose failure message says what to do instead. Put what an agent needs to know in that
  message, not in a doc.
- Test the real implementation instead of copying its logic into the test or mocking it. For ports, use the
  fakes in `packages/core/src/testing`; they are the only stand-ins, and only tests may import them.
- A job is done when a test runs it twice and the second run changes nothing.

## Branches and pull requests

- Make a PR only when asked, and always through the [`pr` skill](.agents/skills/pr/SKILL.md). It sets the branch
  name, title and description, and how to keep the PR up to date until it merges.
- Use conventional commit titles: `type(scope): summary`.
- The `pr` skill comes from `noxaur/skills` and is pinned in `skills-lock.json`. Update it with
  `npx skills update pr`, never by editing it here.

## Code and residue

- Add comments only where the code can't speak for itself.
- Keep plans, research notes and scratch files outside the worktree.
