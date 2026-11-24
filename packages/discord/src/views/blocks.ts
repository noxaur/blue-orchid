import type { ActionName } from "@blue-orchid/core";
import type { Release, Show, ShowId } from "@blue-orchid/domain";
import { ButtonStyle, ComponentType, SeparatorSpacingSize } from "discord-api-types/v10";
import type {
  APIActionRowComponent,
  APIButtonComponent,
  APIComponentInContainer,
  APIComponentInMessageActionRow,
  APIContainerComponent,
  APIMediaGalleryComponent,
  APISectionComponent,
  APISelectMenuOption,
  APISeparatorComponent,
  APIStringSelectComponent,
  APITextDisplayComponent,
} from "discord-api-types/v10";
import { DateTime } from "effect";

/** The edge colour of a container says what kind of message it is. Text itself cannot be coloured. */
export const accent = {
  reply: 0x8b7cf6,
  scheduled: 0x3ba55d,
  moved: 0xf0b232,
  neutral: 0x80848e,
  error: 0xda373c,
} as const;

export const escape = (text: string) => text.replace(/[\\*_~`|>#\-[\]()<]/g, (char) => `\\${char}`);

/** Plain text fields such as select labels allow 100 characters and no markdown. Cuts between code points, so an emoji is never split. */
export const clip = (text: string, max = 100) => {
  if (text.length <= max) {
    return text;
  }
  let kept = "";
  for (const char of text) {
    if (kept.length + char.length > max - 1) {
      break;
    }
    kept += char;
  }
  return `${kept}…`;
};

/** A show's title for markdown. Clipped, so even the longest titles leave every view inside 4,000 characters. */
export const title = (show: Show) => escape(clip(show.title, 150));

/** `<t:…>` renders in each reader's own timezone and language. */
export const stamp = (at: DateTime.Utc, style: "f" | "F" | "R") =>
  `<t:${Math.floor(DateTime.toEpochMillis(at) / 1000)}:${style}>`;

export const when = (at: DateTime.Utc) => `${stamp(at, "F")} · ${stamp(at, "R")}`;

const regions = { JP: "Japan", NO: "Norway" } as const;

/** raw always airs in Japan, so only streams name their country. */
export const releaseLabel = (release: Release) => {
  switch (release.kind) {
    case "raw":
      return `Episode ${release.episode} · Japanese TV`;
    case "sub":
      return `Episode ${release.episode} · Subtitled · ${regions[release.region]}`;
    case "dub":
      return `Episode ${release.episode} · Dubbed · ${regions[release.region]}`;
  }
};

const formats = { tv: "TV", movie: "Movie", ova: "OVA", ona: "ONA", special: "Special" } as const;

/** "TV · Fall 2023 · 28 episodes · 24 min", leaving out what we don't know. */
export const showFacts = (show: Show) =>
  [
    show.format === null ? null : formats[show.format],
    show.season === null || show.year === null
      ? show.year === null
        ? null
        : `${show.year}`
      : `${show.season[0]?.toUpperCase()}${show.season.slice(1)} ${show.year}`,
    show.episodes === null ? null : `${show.episodes} episode${show.episodes === 1 ? "" : "s"}`,
    show.episodeMinutes === null ? null : `${show.episodeMinutes} min`,
  ]
    .filter((fact) => fact !== null)
    .join(" · ");

/** As many whole lines as fit in one text block, with room left for the rest of a message under 4,000 characters. */
export const fitLines = (lines: ReadonlyArray<string>, max = 3400) => {
  const kept: Array<string> = [];
  for (const line of lines) {
    if ([...kept, line].join("\n").length > max) {
      break;
    }
    kept.push(line);
  }
  return { text: kept.join("\n"), count: kept.length };
};

export const more = (count: number) => (count > 0 ? [text(`-# …and ${count} more`)] : []);

export const text = (content: string): APITextDisplayComponent => ({ type: ComponentType.TextDisplay, content });

export const separator = (visible = true): APISeparatorComponent => ({
  type: ComponentType.Separator,
  divider: visible,
  spacing: SeparatorSpacingSize.Small,
});

/** Text with the show's cover on the right, or plain text when the show has no cover. */
export const withCover = (show: Show, content: string): APISectionComponent | APITextDisplayComponent =>
  show.imageUrl === null
    ? text(content)
    : {
        type: ComponentType.Section,
        components: [text(content)],
        accessory: {
          type: ComponentType.Thumbnail,
          media: { url: show.imageUrl },
          description: clip(show.title, 1024),
        },
      };

export const covers = (shows: ReadonlyArray<Show>): ReadonlyArray<APIMediaGalleryComponent> => {
  const items = shows.flatMap((show) =>
    show.imageUrl === null ? [] : [{ media: { url: show.imageUrl }, description: clip(show.title, 1024) }],
  );
  return items.length === 0 ? [] : [{ type: ComponentType.MediaGallery, items: items.slice(0, 10) }];
};

/** A control's custom id: the core action, and the show it acts on when it is a button. */
const controlId = (action: ActionName, show?: ShowId) => (show === undefined ? action : `${action}:${show}`);

export const button = (
  action: ActionName,
  show: ShowId,
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary = ButtonStyle.Secondary,
): APIButtonComponent => ({ type: ComponentType.Button, style, label, custom_id: controlId(action, show) });

/** AniList is where most of our shows come from, so a show with an AniList id links there. */
export const aniListLink = (show: Show): ReadonlyArray<APIButtonComponent> =>
  show.siteIds.flatMap((id) => {
    const match = /^anilist:(\d+)$/.exec(id);
    return match === null
      ? []
      : [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            label: "AniList",
            url: `https://anilist.co/anime/${match[1]}`,
          },
        ];
  });

export const showMenu = (
  action: ActionName,
  placeholder: string,
  options: ReadonlyArray<APISelectMenuOption>,
  many = false,
): APIStringSelectComponent => ({
  type: ComponentType.StringSelect,
  custom_id: controlId(action),
  placeholder,
  options: options.slice(0, 25),
  min_values: 1,
  max_values: many ? Math.min(options.length, 25) : 1,
});

export const row = (
  ...controls: ReadonlyArray<APIComponentInMessageActionRow>
): APIActionRowComponent<APIComponentInMessageActionRow> => ({
  type: ComponentType.ActionRow,
  components: [...controls],
});

export const container = (
  color: number,
  components: ReadonlyArray<APIComponentInContainer>,
): APIContainerComponent => ({ type: ComponentType.Container, accent_color: color, components: [...components] });

/** A short message: a heading and a grey line under it. */
export const notice = (color: number, heading: string, detail: string) =>
  container(color, [text(`### ${heading}\n-# ${detail}`)]);
