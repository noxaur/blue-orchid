# blue-orchid

An anime release tracker: a website, a private GraphQL API and a Discord bot, on Cloudflare via Void.

## Start

```sh
mise install          # Node and pnpm at the pinned versions
pnpm install
pnpm dev              # http://localhost:5173
pnpm check            # everything CI checks
```

The Discord bot is optional locally. To connect it, and to deploy, see [Operations](docs/README.md#operations).

See [AGENTS.md](AGENTS.md) for how the repo is laid out, and [docs/](docs/README.md) for why.
