# Rules

Every rule here has a check that fails when it is broken. A rule with no check is a wish: add the check, or
remove the rule.

| Rule                                                                                  | Enforced by                                                                      |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Dependencies point inward, and each package imports only what its row allows          | `.dependency-cruiser.cjs`                                                        |
| No `shared` or `utils` packages; new packages need approval                           | `unknown-package` in `.dependency-cruiser.cjs`                                   |
| The website gets data only through GraphQL operations                                 | `web-operations-only` in `.dependency-cruiser.cjs`                               |
| Fakes are for tests                                                                   | `testing-only-in-tests` in `.dependency-cruiser.cjs`                             |
| Server values are read in one file                                                    | `env-in-one-place` in `.dependency-cruiser.cjs`, `orchid/no-process-env`         |
| Effects run only in composition roots                                                 | `orchid/no-effect-run`                                                           |
| Failures are tagged errors, not exceptions                                            | `orchid/no-throw`, `orchid/no-try-catch`, `orchid/schema-errors`                 |
| No async/await or hand-made Promises outside tests                                    | `orchid/no-async`                                                                |
| No casts or `any`                                                                     | `orchid/no-type-assertion`, `orchid/no-any`                                      |
| Unknown data is decoded with a Schema                                                 | `orchid/no-json-parse`                                                           |
| Time comes from Effect's Clock                                                        | `orchid/time-through-effect`                                                     |
| One style for functions and services                                                  | `orchid/prefer-effect-fn`, `orchid/service-style`                                |
| Alchemy declares only what Void does not own                                          | `orchid/infra-owns-extras-only`                                                  |
| Every query the website sends is valid against the schema                             | `packages/graphql/src/operations.test.ts`                                        |
| The API runs only the website's operations                                            | `onlyKnownOperations` in `packages/graphql/src/handler.ts`, `handler.test.ts`    |
| A schedule change becomes exactly one update, and each update reaches a follower once | `sync.test.ts`, `deliver.test.ts`                                                |
| Every job has a cron file, and every cron file runs a job                             | `apps/tracker/test/crons.test.ts`                                                |
| Every chat command fits platform limits and is registered with Discord                | `commands.test.ts`, `routes.test.ts`                                             |
| Every platform has a messenger                                                        | the `Messengers` type in `packages/core/src/ports/Messengers.ts`                 |
| A pull request that adds a lint or type suppression explains each one to a reviewer   | `suppressions` in `.github/workflows/label.yml`, `tools/scripts/suppressions.ts` |
| Docs are linked and their links resolve                                               | `tools/scripts/docs.ts`                                                          |
| No unused files, exports or dependencies                                              | `knip`                                                                           |
| Dependencies are at least 14 days old                                                 | `minimumReleaseAge` in `pnpm-workspace.yaml`                                     |
