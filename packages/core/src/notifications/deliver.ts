import { Effect, Result } from "effect";

import { Messengers } from "../ports/Messengers.ts";
import { Subscriptions } from "../ports/Subscriptions.ts";

/** A batch small enough to finish inside one cron run. The rest wait for the next run. */
const batchSize = 100;

/**
 * Sends each claimed update to its follower. A send that fails for now is retried after the claim lease, and one
 * that can never succeed is given up, so neither blocks the deliveries behind it.
 */
export const deliverNotifications = Effect.fn("Notifications.deliver")(function* () {
  const subscriptions = yield* Subscriptions;
  const messengers = yield* Messengers;
  const claimed = yield* subscriptions.claim(batchSize);
  const results = yield* Effect.forEach(
    claimed,
    ({ identity, show, update }) =>
      messengers[identity.platform].send(identity.userId, { _tag: "ShowUpdate", show, update }).pipe(
        Effect.andThen(subscriptions.markSent(update.id, identity)),
        Effect.catchTag("MessageNotSent", (error) =>
          Effect.logWarning("Notification not delivered", error).pipe(
            Effect.andThen(subscriptions.markFailed(update.id, identity, error.permanent)),
            Effect.andThen(Effect.fail(error)),
          ),
        ),
        Effect.result,
      ),
    { concurrency: 4 },
  );
  return { attempted: results.length, failed: results.filter(Result.isFailure).length };
});
