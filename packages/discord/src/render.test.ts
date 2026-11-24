import type { Reply } from "@blue-orchid/core";
import { release, show as showWith } from "@blue-orchid/core/testing";
import { ShowId, Update, UpdateId } from "@blue-orchid/domain";
import { describe, expect, it } from "@effect/vitest";
import { ComponentType } from "discord-api-types/v10";
import { DateTime } from "effect";

import { renderReply } from "./render.ts";

interface Node {
  readonly type: number;
  readonly content?: string;
  readonly components?: ReadonlyArray<Node>;
  readonly accessory?: Node;
}

/** Discord counts nested components too, and caps the text of all text displays together. */
const measure = (nodes: ReadonlyArray<Node>): { components: number; text: number } =>
  nodes.reduce(
    (total, node) => {
      const inner = measure([...(node.components ?? []), ...(node.accessory === undefined ? [] : [node.accessory])]);
      return {
        components: total.components + 1 + inner.components,
        text: total.text + (node.content?.length ?? 0) + inner.text,
      };
    },
    { components: 0, text: 0 },
  );

const longShow = (index: number) =>
  showWith({
    id: ShowId.make(`anilist:${index}`),
    siteIds: [ShowId.make(`anilist:${index}`)],
    /** Markdown characters escape to two each, the worst case for the text limit. */
    title: `A Very Long Show Title Number ${index} `.padEnd(4000, "*_"),
    imageUrl: `https://img.anili.st/media/${index}.jpg`,
  });

const shows = Array.from({ length: 60 }, (_, index) => longShow(index));
const releases = shows.map((show) => ({ show, release: release({ showId: show.id }) }));
const at = DateTime.makeUnsafe("2026-01-09T15:00:00Z");

const moved: Reply = {
  _tag: "ShowUpdate",
  show: longShow(1),
  update: new Update({
    id: UpdateId.make("u1"),
    detectedAt: at,
    change: { _tag: "EpisodeRescheduled", release: release(), previousAirsAt: at },
  }),
};

const biggest: ReadonlyArray<Reply> = [
  { _tag: "Schedule", scope: "following", releases },
  { _tag: "Schedule", scope: "all", releases },
  { _tag: "Following", shows: shows.map((show) => ({ show, next: release({ showId: show.id }) })) },
  { _tag: "Choose", action: "follow", query: "x".repeat(500), shows: shows.slice(0, 25) },
  { _tag: "Followed", show: longShow(1), next: release() },
  { _tag: "Unfollowed", show: longShow(1), wasFollowing: true },
  moved,
  { _tag: "NoMatch", query: "x".repeat(500) },
];

describe("renderReply", () => {
  it.each(biggest.map((reply) => [reply._tag, reply] as const))(
    "keeps the largest %s within Discord's 40 components and 4,000 characters",
    (_, reply) => {
      const size = measure(renderReply(reply));
      expect(size.components).toBeLessThanOrEqual(40);
      expect(size.text).toBeLessThanOrEqual(4000);
    },
  );

  it("strikes through the old time of a moved episode, as a timestamp", () => {
    const [container] = renderReply(moved);
    const texts = JSON.stringify(container);
    expect(texts).toContain("~~<t:1767970800:F>~~");
  });

  it("tells apart two shows that share a title and details by their site id", () => {
    const [container] = renderReply({
      _tag: "Choose",
      action: "follow",
      query: "frieren",
      shows: [showWith({}), showWith({ id: ShowId.make("anilist:9"), siteIds: [ShowId.make("anilist:9")] })],
    });
    expect(JSON.stringify(container)).toContain('"description":"TV · Fall 2023 · 28 episodes · 24 min · anilist:9"');
  });

  it("never splits an emoji when it clips a menu label", () => {
    const [container] = renderReply({
      _tag: "Choose",
      action: "follow",
      query: "a",
      shows: [showWith({ title: `${"a".repeat(98)}😀zz` })],
    });
    expect(JSON.stringify(container)).toContain(`"label":"${"a".repeat(98)}…"`);
  });

  it("puts each show's cover beside it and links to AniList", () => {
    const [container] = renderReply({ _tag: "Followed", show: longShow(7), next: undefined });
    expect(container?.components[0]).toMatchObject({
      type: ComponentType.Section,
      accessory: { type: ComponentType.Thumbnail, media: { url: "https://img.anili.st/media/7.jpg" } },
    });
    expect(JSON.stringify(container)).toContain('"custom_id":"unfollow:anilist:7"');
    expect(JSON.stringify(container)).toContain("https://anilist.co/anime/7");
  });
});
