import type { CatalogSlice } from "@blue-orchid/core";
import { CatalogSource } from "@blue-orchid/core";
import type { Format, Season, Status } from "@blue-orchid/domain";
import { Show, SourceUnavailable } from "@blue-orchid/domain";
import { DateTime, Effect, Layer, Schedule, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

export const wikidataApi = "https://query.wikidata.org/sparql";

/** Wikidata's anime item types, in the order a show's format is picked when it has several. */
const formats: ReadonlyArray<readonly [string, Format | null]> = [
  ["Q63952888", "tv"],
  ["Q100269041", "tv"],
  ["Q20650540", "movie"],
  ["Q220898", "ova"],
  ["Q113687694", "ova"],
  ["Q113671041", "ona"],
  ["Q1047299", "ona"],
  ["Q104775758", "special"],
  ["Q117209498", "special"],
  ["Q1107", null],
];

/** Site id prefix → Wikidata property. The first one an item has becomes the show's id. */
const sites = [
  ["syoboi", "P11648"],
  ["anilist", "P8729"],
  ["myanimelist", "P4086"],
  ["anidb", "P5646"],
  ["kitsu", "P11495"],
  ["livechart", "P12489"],
  ["animenewsnetwork", "P1985"],
] as const;

const literal = (time: DateTime.Utc) => `"${DateTime.formatIso(time)}"`;
const dateTime = (time: DateTime.Utc) => `${literal(time)}^^xsd:dateTime`;

/** The earliest start (or else publication) and latest end, each as "time|precision" so the two stay paired. */
const startOf = `MIN(CONCAT(STR(?first), "|", STR(?firstPrecision)))`;
const endOf = `MAX(CONCAT(STR(?endTime), "|", STR(?endPrecision)))`;

/** Finds the slice's items cheaply, and then the exact test on each item's chosen dates. */
const filtersFor = (slice: CatalogSlice, now: DateTime.Utc) => {
  const twoYearsAgo = literal(DateTime.subtract(now, { years: 2 }));
  switch (slice._tag) {
    case "Airing":
      return {
        candidates: `?item wdt:P580|wdt:P577 ?date . FILTER(?date >= ${dateTime(DateTime.subtract(now, { years: 2 }))} && ?date <= ${dateTime(now)})`,
        having: `${startOf} >= ${twoYearsAgo} && ${startOf} <= ${literal(now)} && (COUNT(?endTime) = 0 || ${endOf} >= ${literal(now)})`,
      };
    case "Upcoming":
      return {
        candidates: `?item wdt:P580|wdt:P577 ?date . FILTER(?date > ${dateTime(now)})`,
        having: `${startOf} > ${literal(now)}`,
      };
    case "Year":
      return {
        candidates: `?item wdt:P580|wdt:P577 ?date . FILTER(YEAR(?date) = ${slice.year})`,
        having: `STRSTARTS(${startOf}, "${String(slice.year).padStart(4, "0")}-")`,
      };
    case "Undated":
      return { candidates: "FILTER NOT EXISTS { ?item wdt:P580|wdt:P577 [] }", having: undefined };
  }
};

const candidatesQuery = (candidates: string) => `
SELECT DISTINCT ?item WHERE {
  VALUES ?animeType { ${formats.map(([id]) => `wd:${id}`).join(" ")} }
  ?item wdt:P31 ?animeType .
  ${candidates}
}`;

/** Only best-rank statements count, so a deprecated date never wins. */
const timeOf = (property: string, time: string, precision: string) =>
  `OPTIONAL { ?item p:${property} [ a wikibase:BestRank; psv:${property} [ wikibase:timeValue ?${time}; wikibase:timePrecision ?${precision} ] ] }`;

// A flat query: Wikidata drops the VALUES binding of a nested GROUP BY and scans every item instead.
const detailsQuery = (items: ReadonlyArray<string>, having: string | undefined) => `
SELECT ?item ?itemLabel
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?type), "entity/"); separator=" ") AS ?types)
  (MAX(?episodes) AS ?episodeCount)
  (${startOf} AS ?start) (${endOf} AS ?end)
  ${sites.map(([site]) => `(GROUP_CONCAT(DISTINCT ?${site}; separator=" ") AS ?${site}Ids)`).join(" ")}
WHERE {
  VALUES ?item { ${items.map((qid) => `wd:${qid}`).join(" ")} }
  OPTIONAL { ?item wdt:P31 ?type }
  ${timeOf("P580", "startTime", "startPrecision")}
  ${timeOf("P577", "published", "publishedPrecision")}
  ${timeOf("P582", "endTime", "endPrecision")}
  OPTIONAL { ?item wdt:P1113 ?episodes }
  ${sites.map(([site, property]) => `OPTIONAL { ?item wdt:${property} ?${site} }`).join("\n  ")}
  BIND(COALESCE(?startTime, ?published) AS ?first)
  BIND(COALESCE(?startPrecision, ?publishedPrecision) AS ?firstPrecision)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ja,mul". }
}
GROUP BY ?item ?itemLabel
${having === undefined ? "" : `HAVING (${having})`}
`;

/** Items per details query: small enough to answer in seconds, and a POST body has no URL length limit. */
const batchSize = 50;

const Value = Schema.Struct({ value: Schema.String });
const Answer = Schema.Struct({
  results: Schema.Struct({ bindings: Schema.Array(Schema.Record(Schema.String, Value)) }),
});
type Row = (typeof Answer.Type)["results"]["bindings"][number];

/** A "time|precision" pair as a partial date. Wikidata precision 9 is a year, 10 a month, 11 a day. */
const partialDate = (paired: string | undefined) => {
  if (paired === undefined || paired === "") {
    return null;
  }
  const [time = "", precision = "9"] = paired.split("|");
  return time.slice(0, Number(precision) >= 11 ? 10 : Number(precision) === 10 ? 7 : 4);
};

const seasons = ["winter", "spring", "summer", "fall"] as const;

/** Quarters, except that a show starting in the second half of a quarter's last month opens the next season. */
const seasonOf = (date: string | null): Season | null => {
  if (date === null || date.length < 7) {
    return null;
  }
  const month = Number(date.slice(5, 7));
  const late = month % 3 === 0 && date.length === 10 && Number(date.slice(8, 10)) >= 15;
  return seasons[(Math.floor((month - 1) / 3) + (late ? 1 : 0)) % 4] ?? null;
};

/** `day` cut to `date`'s precision, so the two compare as equals. */
const toPrecision = (date: string, day: string) => day.slice(0, date.length);

const qidOf = (row: Row) => (row["item"]?.value ?? "").split("/").at(-1) ?? "";

const toShow = (row: Row, now: DateTime.Utc) => {
  const qid = qidOf(row);
  const siteIds = [
    ...sites.flatMap(([site]) =>
      (row[`${site}Ids`]?.value ?? "")
        .split(" ")
        .filter((id) => id !== "")
        .toSorted()
        .map((id) => `${site}:${id}`),
    ),
    `wikidata:${qid}`,
  ];
  const startDate = partialDate(row["start"]?.value);
  const endDate = partialDate(row["end"]?.value);
  // Compared at each date's own precision, so a show that ends "2026" is not finished until 2027.
  const today = DateTime.formatIso(now).slice(0, 10);
  const twoYearsAgo = DateTime.formatIso(DateTime.subtract(now, { years: 2 })).slice(0, 10);
  // Old shows often have no end date, so only a recent start without an end counts as airing.
  const status: Status | null =
    endDate !== null && endDate < toPrecision(endDate, today)
      ? "finished"
      : startDate !== null && startDate > toPrecision(startDate, today)
        ? "upcoming"
        : startDate !== null && startDate >= toPrecision(startDate, twoYearsAgo)
          ? "airing"
          : null;
  const types = new Set((row["types"]?.value ?? "").split(" "));
  const label = row["itemLabel"]?.value ?? "";
  const episodes = Number(row["episodeCount"]?.value);
  return Schema.decodeUnknownEffect(Show)({
    id: siteIds[0],
    // Without a label in any language Wikidata answers the item id itself.
    title: label === qid ? "" : label,
    imageUrl: null,
    episodes: Number.isInteger(episodes) ? episodes : null,
    format: formats.find(([type, format]) => format !== null && types.has(type))?.[1] ?? null,
    status,
    season: seasonOf(startDate),
    year: startDate === null ? null : Number(startDate.slice(0, 4)),
    startDate,
    endDate,
    episodeMinutes: null,
    siteIds,
  });
};

/** Every anime Wikidata knows, one catalog slice at a time. Wikidata is CC0: free to copy and keep. */
export const WikidataCatalogLive = Layer.effect(
  CatalogSource,
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.filterStatusOk,
      HttpClient.retryTransient({ schedule: Schedule.spaced("1 minute"), times: 2 }),
    );
    const run = (query: string) =>
      HttpClientRequest.post(wikidataApi).pipe(
        // Wikidata asks every client for a User-Agent with a way to reach its owner.
        HttpClientRequest.setHeader("User-Agent", "blue-orchid/0.1 (+https://github.com/noxaur/blue-orchid)"),
        HttpClientRequest.setHeader("Accept", "application/sparql-results+json"),
        HttpClientRequest.bodyUrlParams({ query }),
        client.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Answer)),
        Effect.map((answer) => answer.results.bindings),
      );
    const fetch = Effect.fn("Wikidata.fetch")(function* (slice: CatalogSlice) {
      const now = yield* DateTime.now;
      const { candidates, having } = filtersFor(slice, now);
      const items = (yield* run(candidatesQuery(candidates))).map(qidOf);
      const rows = (yield* Effect.forEach(
        Array.from({ length: Math.ceil(items.length / batchSize) }, (_, index) =>
          items.slice(index * batchSize, (index + 1) * batchSize),
        ),
        (batch) => run(detailsQuery(batch, having)),
      )).flat();
      const [shows, skipped] = yield* Effect.partition(rows, (row) => toShow(row, now));
      if (skipped.length > 0) {
        yield* Effect.logWarning("Skipped Wikidata items the catalog can't hold", skipped.length);
      }
      return shows;
    });
    return CatalogSource.of({
      name: "wikidata",
      fetch: (slice) =>
        fetch(slice).pipe(Effect.mapError((cause) => new SourceUnavailable({ source: "wikidata", cause }))),
    });
  }),
);
