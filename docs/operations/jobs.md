# Jobs

`packages/core/src/jobs.ts` lists every job and what it does. Each runs from its file in `apps/tracker/crons/`, on
the schedule in that file's `cron` export. A job is safe to run late, twice or alongside itself, so a missed or
failed run catches up on the next one.

## Run one locally

Schedules don't fire under `pnpm dev`. At start-up, Void prints a curl command that triggers a scheduled run; send
it with the job's `cron` expression. The log then shows `Job finished` with the job's name and its report.
