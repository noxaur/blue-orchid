# Hosting

Void owns the app. `void deploy` builds `apps/tracker`, creates the Worker, D1, KV, R2, queues and cron triggers
it infers from the code, applies migrations, and uploads. Its IDs live in `apps/tracker/void.lock.json`, which
is committed. After `ci` passes on `main`, `.github/workflows/deploy.yml` runs `void deploy` with the
`CLOUDFLARE_API_TOKEN` repository secret, and only for the commit still at the tip of `main`.

Alchemy owns everything else: resources the app does not declare, such as DNS records, resources on other clouds,
or buckets that other tools write to. They go in `infra/alchemy.run.ts`.

Each resource has one owner, because two tools deploying the same Worker or database overwrite each other's
settings. The `orchid/infra-owns-extras-only` lint rule stops the app's resource types from being declared in
`infra/`. We rejected Alchemy for everything: Alchemy v2 is in beta with breaking releases every week or two,
and Void already gives us auth, crons and D1 together.
