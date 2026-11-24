import type { ChatIdentity, Show, ShowId, StoreFailed, Update, UpdateId } from "@blue-orchid/domain";
import { Duration } from "effect";
import type { Effect } from "effect";
import { Context } from "effect";

export interface PendingDelivery {
  readonly identity: ChatIdentity;
  readonly show: Show;
  readonly update: Update;
}

/** How long a claimed delivery stays hidden from other runs. A send that failed for now is retried after it. */
export const claimLease = Duration.minutes(15);

/** Sends tried this many times without success are given up. */
export const maxAttempts = 5;

/** Who follows which show, and which updates each follower has been sent. */
export class Subscriptions extends Context.Service<
  Subscriptions,
  {
    readonly follow: (identity: ChatIdentity, show: ShowId) => Effect.Effect<void, StoreFailed>;
    /** Stops every listed follow in one call, and succeeds with how many the identity had. */
    readonly unfollow: (identity: ChatIdentity, shows: ReadonlyArray<ShowId>) => Effect.Effect<number, StoreFailed>;
    readonly followed: (identity: ChatIdentity) => Effect.Effect<ReadonlyArray<Show>, StoreFailed>;
    /**
     * Takes up to `limit` deliveries with attempts left that no one has claimed in the last `claimLease`, oldest
     * update first, and claims
     * them in one atomic step, so two overlapping runs never send the same one.
     */
    readonly claim: (limit: number) => Effect.Effect<ReadonlyArray<PendingDelivery>, StoreFailed>;
    readonly markSent: (update: UpdateId, identity: ChatIdentity) => Effect.Effect<void, StoreFailed>;
    /** A permanent failure, or the `maxAttempts`th, gives the delivery up. Otherwise it is retried after the lease. */
    readonly markFailed: (
      update: UpdateId,
      identity: ChatIdentity,
      permanent: boolean,
    ) => Effect.Effect<void, StoreFailed>;
  }
>()("orchid/core/Subscriptions") {}
