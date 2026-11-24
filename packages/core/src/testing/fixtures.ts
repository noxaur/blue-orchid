import { Release, Show, ShowId } from "@blue-orchid/domain";
import { DateTime } from "effect";

const frierenFields = {
  id: ShowId.make("anilist:154587"),
  title: "Frieren: Beyond Journey's End",
  imageUrl: null,
  episodes: 28,
  format: "tv",
  status: "finished",
  season: "fall",
  year: 2023,
  startDate: "2023-09-29",
  endDate: "2024-03-22",
  episodeMinutes: 24,
  siteIds: [ShowId.make("anilist:154587"), ShowId.make("myanimelist:52991")],
} satisfies ConstructorParameters<typeof Show>[0];

export const frieren = new Show(frierenFields);

/** Another show, with Frieren's details where not given. */
export const show = (overrides: Partial<ConstructorParameters<typeof Show>[0]>) =>
  new Show({ ...frierenFields, ...overrides });

export const release = (overrides: Partial<ConstructorParameters<typeof Release>[0]> = {}) =>
  new Release({
    showId: frieren.id,
    episode: 1,
    kind: "sub",
    region: "NO",
    airsAt: DateTime.makeUnsafe("2026-01-09T15:00:00Z"),
    ...overrides,
  });
