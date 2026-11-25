import { Catalog, claimLease, maxAttempts, Subscriptions } from "@blue-orchid/core";
import type { ChatIdentity } from "@blue-orchid/domain";
import {
  ChangeJson,
  ChatIdentity as ChatIdentitySchema,
  Release,
  releaseKey,
  Show,
  ShowId,
  ShowNotFound,
  StoreFailed,
  Update,
} from "@blue-orchid/domain";
import { DateTime, Duration, Effect, Layer, Schema } from "effect";
import { and, asc, db as appDb, eq, gte, inArray, isNull, lt, lte, or, sql } from "void/db";

import { deliveries, follows, releases, showSiteIds, shows, updates } from "../db/schema.ts";

/** D1 binds at most 100 values per statement, so writes and IN lists go in chunks. */
const maxBoundValues = 100;

const chunks = <A>(items: ReadonlyArray<A>, size: number): ReadonlyArray<ReadonlyArray<A>> =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

/** Rows per insert, sized by how many columns a row binds. */
const showRow = (show: Show) => ({
  id: show.id,
  title: show.title,
  imageUrl: show.imageUrl,
  episodes: show.episodes,
  format: show.format,
  status: show.status,
  season: show.season,
  year: show.year,
  startDate: show.startDate,
  endDate: show.endDate,
  episodeMinutes: show.episodeMinutes,
});

const insertBatches = <A extends object>(rows: ReadonlyArray<A>) => {
  const [first] = rows;
  return first === undefined ? [] : chunks(rows, Math.floor(maxBoundValues / Object.keys(first).length));
};

const query = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new StoreFailed({ operation, cause }) });

const decode =
  <S extends Schema.Decoder<unknown>>(schema: S, operation: string) =>
  (input: unknown) =>
    Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError((cause) => new StoreFailed({ operation, cause })));

type ShowRow = typeof shows.$inferSelect;
type ReleaseRow = typeof releases.$inferSelect;

const siteIdsOfShow = sql<string>`(SELECT json_group_array(site_id) FROM (SELECT own.site_id FROM ${showSiteIds} AS own WHERE own.show_id = ${shows.id} ORDER BY own.site_id))`;

const SiteIds = Schema.fromJsonString(Schema.Array(ShowId));

const toShow = ({ show, siteIds }: { readonly show: ShowRow; readonly siteIds: string }) =>
  decode(
    SiteIds,
    "decode site ids",
  )(siteIds).pipe(Effect.flatMap((decoded) => decode(Show, "decode show")({ ...show, siteIds: decoded })));
const toRelease = (row: ReleaseRow) =>
  decode(Release, "decode release")({ ...row, airsAt: DateTime.makeUnsafe(row.airsAt) });

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

type Db = typeof appDb;

const makeCatalog = (db: Db) =>
  Catalog.of({
    releasesBetween: (from, to) =>
      query("releasesBetween", () =>
        db
          .select({ show: shows, siteIds: siteIdsOfShow, release: releases })
          .from(releases)
          .innerJoin(shows, eq(shows.id, releases.showId))
          .where(
            and(gte(releases.airsAt, DateTime.toEpochMillis(from)), lt(releases.airsAt, DateTime.toEpochMillis(to))),
          )
          .orderBy(asc(releases.airsAt))
          .limit(1000),
      ).pipe(
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => Effect.all({ show: toShow(row), release: toRelease(row.release) })),
        ),
      ),
    show: Effect.fn("Catalog.show")(function* (id) {
      const [row] = yield* query("show", () =>
        db
          .select({ show: shows, siteIds: siteIdsOfShow })
          .from(showSiteIds)
          .innerJoin(shows, eq(shows.id, showSiteIds.showId))
          .where(eq(showSiteIds.siteId, id)),
      );
      if (row === undefined) {
        return yield* new ShowNotFound({ query: id });
      }
      return yield* toShow(row);
    }),
    showReleases: (id) =>
      query("showReleases", () =>
        db.select().from(releases).where(eq(releases.showId, id)).orderBy(asc(releases.airsAt)).limit(1000),
      ).pipe(Effect.flatMap((rows) => Effect.forEach(rows, toRelease))),
    nextRelease: (id, from) =>
      query("nextRelease", () =>
        db
          .select()
          .from(releases)
          .where(and(eq(releases.showId, id), gte(releases.airsAt, DateTime.toEpochMillis(from))))
          .orderBy(asc(releases.airsAt))
          .limit(1),
      ).pipe(Effect.flatMap(([row]) => (row === undefined ? Effect.succeed(undefined) : toRelease(row)))),
    nextReleases: (ids, from) =>
      Effect.forEach(chunks(ids, maxBoundValues - 1), (batch) =>
        query("nextReleases", () =>
          db
            .select()
            .from(releases)
            .where(and(inArray(releases.showId, [...batch]), gte(releases.airsAt, DateTime.toEpochMillis(from))))
            .orderBy(asc(releases.airsAt)),
        ),
      ).pipe(
        Effect.flatMap((batches) => {
          const earliest = new Map<string, (typeof batches)[number][number]>();
          for (const row of batches.flat()) {
            if (!earliest.has(row.showId)) {
              earliest.set(row.showId, row);
            }
          }
          return Effect.forEach([...earliest.values()], toRelease);
        }),
        Effect.map((next) => new Map(next.map((release) => [release.showId, release] as const))),
      ),
    searchShows: (title, limit) =>
      query("searchShows", () =>
        db
          .select({ show: shows, siteIds: siteIdsOfShow })
          .from(shows)
          .where(sql`${shows.title} LIKE ${`%${escapeLike(title)}%`} ESCAPE '\\'`)
          .orderBy(sql`length(${shows.title})`)
          .limit(limit),
      ).pipe(Effect.flatMap((rows) => Effect.forEach(rows, toShow))),
    releasesByKey: (keys) =>
      Effect.forEach(chunks(keys, maxBoundValues), (batch) =>
        query("releasesByKey", () =>
          db
            .select()
            .from(releases)
            .where(inArray(releases.key, [...batch])),
        ),
      ).pipe(
        Effect.flatMap((batches) =>
          Effect.forEach(batches.flat(), (row) =>
            toRelease(row).pipe(Effect.map((release) => ({ release, revision: row.revision }))),
          ),
        ),
      ),
    ownersOf: (siteIds) =>
      Effect.forEach(chunks(siteIds, maxBoundValues), (batch) =>
        query("ownersOf", () =>
          db
            .select()
            .from(showSiteIds)
            .where(inArray(showSiteIds.siteId, [...batch])),
        ),
      ).pipe(
        Effect.flatMap((batches) =>
          decode(Schema.Array(Schema.Struct({ siteId: ShowId, showId: ShowId })), "decode owners")(batches.flat()),
        ),
        Effect.map((rows) => new Map(rows.map((row) => [row.siteId, row.showId]))),
      ),
    save: Effect.fn("Catalog.save")(function* (changes) {
      const updateRows = yield* Effect.forEach(changes.updates, (update) =>
        Schema.encodeEffect(ChangeJson)(update.change).pipe(
          Effect.mapError((cause) => new StoreFailed({ operation: "encode update", cause })),
          Effect.map((change) => ({
            id: update.id,
            showId: update.change.release.showId,
            detectedAt: DateTime.toEpochMillis(update.detectedAt),
            change,
            release: update.change.release,
          })),
        ),
      );
      const revisions = new Map(changes.releases.map((row) => [releaseKey(row.release), row.revision]));
      // Every update of one save shares the run's time. A save with no updates is never older than a stored change.
      const runAt = updateRows[0]?.detectedAt ?? Number.MAX_SAFE_INTEGER;
      const statements = [
        ...insertBatches(changes.shows.map(showRow)).map((batch) =>
          db
            .insert(shows)
            .values([...batch])
            .onConflictDoUpdate({
              target: shows.id,
              set: {
                title: sql`excluded.title`,
                imageUrl: sql`excluded.image_url`,
                episodes: sql`excluded.episodes`,
                format: sql`excluded.format`,
                status: sql`excluded.status`,
                season: sql`excluded.season`,
                year: sql`excluded.year`,
                startDate: sql`excluded.start_date`,
                endDate: sql`excluded.end_date`,
                episodeMinutes: sql`excluded.episode_minutes`,
              },
            }),
        ),
        // One row per site id, so a site id two shows claim goes to the show saved last.
        ...insertBatches([
          ...new Map(
            changes.shows.flatMap((show) =>
              show.siteIds.map((siteId) => [siteId, { siteId, showId: show.id }] as const),
            ),
          ).values(),
        ]).map((batch) =>
          db
            .insert(showSiteIds)
            .values([...batch])
            .onConflictDoUpdate({ target: showSiteIds.siteId, set: { showId: sql`excluded.show_id` } }),
        ),
        ...insertBatches((changes.showsIfMissing ?? []).map(showRow)).map((batch) =>
          db
            .insert(shows)
            .values([...batch])
            .onConflictDoNothing(),
        ),
        ...insertBatches(
          (changes.showsIfMissing ?? []).flatMap((show) => show.siteIds.map((siteId) => ({ siteId, showId: show.id }))),
        ).map((batch) =>
          db
            .insert(showSiteIds)
            .values([...batch])
            .onConflictDoNothing(),
        ),
        ...insertBatches(
          changes.releases.map(({ release, revision }) => ({
            key: releaseKey(release),
            showId: release.showId,
            episode: release.episode,
            kind: release.kind,
            region: release.region,
            airsAt: DateTime.toEpochMillis(release.airsAt),
            revision,
          })),
        ).map((batch) =>
          db
            .insert(releases)
            .values([...batch])
            .onConflictDoUpdate({
              target: releases.key,
              set: { airsAt: sql`excluded.airs_at`, revision: sql`excluded.revision` },
              // Only the next revision, and only from a run that started after the one that stored the current
              // revision. Another overlapping run therefore never overwrites a newer time with an older snapshot.
              setWhere: sql`${releases.revision} = excluded.revision - 1 AND NOT EXISTS (SELECT 1 FROM ${updates} WHERE ${updates.id} = ${releases.key} || ':r' || ${releases.revision} AND ${updates.detectedAt} > ${runAt})`,
            }),
        ),
        // An update is stored only when its release now holds that revision and time, so a run whose release write
        // lost to another run leaves no update behind. The next sync sees the stored time and records any move.
        ...updateRows.map((row) =>
          db
            .insert(updates)
            .select(
              db
                .select({
                  id: sql<string>`${row.id}`.as("id"),
                  showId: sql<string>`${row.showId}`.as("show_id"),
                  detectedAt: sql<number>`${row.detectedAt}`.as("detected_at"),
                  change: sql<string>`${row.change}`.as("change"),
                })
                .from(releases)
                .where(
                  and(
                    eq(releases.key, releaseKey(row.release)),
                    eq(releases.revision, revisions.get(releaseKey(row.release)) ?? -1),
                    eq(releases.airsAt, DateTime.toEpochMillis(row.release.airsAt)),
                  ),
                ),
            )
            .onConflictDoNothing(),
        ),
      ];
      const [first, ...rest] = statements;
      if (first === undefined) {
        return;
      }
      // One D1 batch is one transaction: a release is never stored without the update it caused.
      yield* query("save", () => db.batch([first, ...rest]));
    }),
  });

const sameIdentity = (identity: ChatIdentity) =>
  and(eq(follows.platform, identity.platform), eq(follows.userId, identity.userId));

const deliveryOf = (update: string, identity: ChatIdentity) =>
  and(
    eq(deliveries.updateId, update),
    eq(deliveries.platform, identity.platform),
    eq(deliveries.userId, identity.userId),
  );

const leaseMillis = Duration.toMillis(claimLease);

const makeSubscriptions = (db: Db) =>
  Subscriptions.of({
    follow: Effect.fn("Subscriptions.follow")(function* (identity, show) {
      const since = DateTime.toEpochMillis(yield* DateTime.now);
      yield* query("follow", () =>
        db
          .insert(follows)
          .values({ platform: identity.platform, userId: identity.userId, showId: show, since })
          .onConflictDoNothing(),
      );
    }),
    unfollow: (identity, showIds) =>
      Effect.forEach(chunks(showIds, maxBoundValues - 2), (batch) =>
        query("unfollow", () =>
          db
            .delete(follows)
            .where(and(sameIdentity(identity), inArray(follows.showId, [...batch])))
            .returning({ showId: follows.showId }),
        ),
      ).pipe(Effect.map((batches) => batches.flat().length)),
    followed: (identity) =>
      query("followed", () =>
        db
          .select({ show: shows, siteIds: siteIdsOfShow })
          .from(follows)
          .innerJoin(shows, eq(shows.id, follows.showId))
          .where(sameIdentity(identity))
          .orderBy(asc(shows.title)),
      ).pipe(Effect.flatMap((rows) => Effect.forEach(rows, toShow))),
    claim: Effect.fn("Subscriptions.claim")(function* (limit) {
      const now = DateTime.toEpochMillis(yield* DateTime.now);
      const stale = now - leaseMillis;
      const candidates = yield* query("claim candidates", () =>
        db
          .select({
            platform: follows.platform,
            userId: follows.userId,
            show: shows,
            siteIds: siteIdsOfShow,
            update: updates,
          })
          .from(follows)
          .innerJoin(updates, and(eq(updates.showId, follows.showId), gte(updates.detectedAt, follows.since)))
          .innerJoin(shows, eq(shows.id, follows.showId))
          .leftJoin(
            deliveries,
            and(
              eq(deliveries.updateId, updates.id),
              eq(deliveries.platform, follows.platform),
              eq(deliveries.userId, follows.userId),
            ),
          )
          .where(
            or(
              isNull(deliveries.updateId),
              and(
                eq(deliveries.status, "claimed"),
                lte(deliveries.claimedAt, stale),
                lt(deliveries.attempts, maxAttempts),
              ),
            ),
          )
          .orderBy(asc(updates.detectedAt))
          .limit(limit),
      );
      // Each claim is a conditional upsert. Only one of two overlapping runs gets a row back, and only it sends.
      const claims = candidates.map((row) =>
        db
          .insert(deliveries)
          .values({
            updateId: row.update.id,
            platform: row.platform,
            userId: row.userId,
            status: "claimed",
            attempts: 1,
            claimedAt: now,
          })
          .onConflictDoUpdate({
            target: [deliveries.updateId, deliveries.platform, deliveries.userId],
            set: { attempts: sql`${deliveries.attempts} + 1`, claimedAt: now },
            setWhere: sql`${deliveries.status} = 'claimed' AND ${deliveries.claimedAt} <= ${stale} AND ${deliveries.attempts} < ${maxAttempts}`,
          })
          .returning({ updateId: deliveries.updateId }),
      );
      const [first, ...rest] = claims;
      const won = first === undefined ? [] : yield* query("claim", () => db.batch([first, ...rest]));
      const claimed = candidates.filter((_, index) => (won[index]?.length ?? 0) > 0);
      return yield* Effect.forEach(claimed, (row) =>
        Effect.all({
          identity: decode(ChatIdentitySchema, "decode identity")({ platform: row.platform, userId: row.userId }),
          show: toShow(row),
          update: Schema.decodeEffect(ChangeJson)(row.update.change).pipe(
            Effect.mapError((cause) => new StoreFailed({ operation: "decode update", cause })),
            Effect.flatMap((change) =>
              decode(
                Update,
                "decode update",
              )({
                id: row.update.id,
                detectedAt: DateTime.makeUnsafe(row.update.detectedAt),
                change,
              }),
            ),
          ),
        }),
      );
    }),
    markSent: Effect.fn("Subscriptions.markSent")(function* (update, identity) {
      const deliveredAt = DateTime.toEpochMillis(yield* DateTime.now);
      yield* query("markSent", () =>
        db.update(deliveries).set({ status: "sent", deliveredAt }).where(deliveryOf(update, identity)),
      );
    }),
    markFailed: (update, identity, permanent) =>
      query("markFailed", () =>
        db
          .update(deliveries)
          .set({ status: "failed" })
          .where(
            permanent
              ? deliveryOf(update, identity)
              : and(deliveryOf(update, identity), gte(deliveries.attempts, maxAttempts)),
          ),
      ).pipe(Effect.asVoid),
  });

/** Catalog and Subscriptions on a D1 database. Tests pass a local one. */
export const makeStore = (db: Db) =>
  Layer.mergeAll(Layer.succeed(Catalog, makeCatalog(db)), Layer.succeed(Subscriptions, makeSubscriptions(db)));

/** The store on the app's D1 database, through Void's Drizzle client. */
export const StoreLive = makeStore(appDb);
