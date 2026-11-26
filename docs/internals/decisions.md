# Decisions

**Updates are schedule changes.** For v1, an update is a newly scheduled or moved episode, which the sync job can
detect by diffing. News and sequel announcements would need another source and are left for later.

**Follows belong to chat identities.** A follow is keyed by platform and user id, such as `discord:123`, so the
bot works without a website account. Linking a website account to a chat identity is later work.

**Raw, sub and dub are separate releases.** One episode can have a Japanese broadcast, a subbed and a dubbed
release, each with its own time and region. Each has its own key, so moving one never moves the others.

**The API is private GraphQL.** Only the website calls it. A public API would pass on data whose sources limit
redistribution; see the Data sources doc in Linear.

**Schedules live in the cron files.** Void reads `export const cron` from each file in `crons/`, so the schedule
cannot come from core. Core's `jobs` table holds what each job does, and a test keeps the two lists equal.

**Dependencies must be 14 days old.** `minimumReleaseAge` in `pnpm-workspace.yaml` gives a hijacked release time
to be caught before it reaches us.

**TheTVDB is the only data source.** It replaced Wikidata (catalog) and Syoboi Calendar (schedule) so one source
names every show and episode. Its free key needs a visible credit with a link on every surface, does not cover
artwork, and forbids passing data on, so shows have no images and the API stays private. It gives an air date per
episode and one air time per series, so times are less exact than Syoboi's broadcast listings.
