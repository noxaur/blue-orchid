import type { StoreFailed } from "@blue-orchid/domain";
import type { Effect } from "effect";

import { importCatalog } from "./catalog/importCatalog.ts";
import { deliverNotifications } from "./notifications/deliver.ts";
import type { Catalog } from "./ports/Catalog.ts";
import type { CatalogSource } from "./ports/CatalogSource.ts";
import type { Messengers } from "./ports/Messengers.ts";
import type { ScheduleSources } from "./ports/ScheduleSources.ts";
import type { ShowDetailsSources } from "./ports/ShowDetails.ts";
import type { Subscriptions } from "./ports/Subscriptions.ts";
import { syncSchedule } from "./schedule/sync.ts";

export type JobServices = Catalog | CatalogSource | ShowDetailsSources | Subscriptions | ScheduleSources | Messengers;

/** A job must be safe to run twice or to overlap with itself: cron runs can repeat and can be late. */
export interface Job {
  readonly description: string;
  readonly run: Effect.Effect<unknown, StoreFailed, JobServices>;
}

/**
 * Every scheduled job. apps/tracker/crons/<name>.ts runs each one and holds its schedule, because Void reads the
 * schedule from that file. A test in apps/tracker checks that the two lists match.
 */
export const jobs = {
  "sync-schedule": {
    description: "Pull every schedule source and record updates for new or moved releases",
    run: syncSchedule(),
  },
  "import-catalog": {
    description: "Refresh one slice of the catalog's shows from the catalog source, and fill gaps from details sources",
    run: importCatalog(),
  },
  "deliver-notifications": {
    description: "Send pending updates to the people who follow the show",
    run: deliverNotifications(),
  },
} satisfies Record<string, Job>;

export type JobName = keyof typeof jobs;
