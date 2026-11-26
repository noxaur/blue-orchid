# source-thetvdb

TheTVDB as a details source: fills in what Wikidata leaves blank, such as minutes per episode. Imports `core`,
`domain` and `effect`.

- API v4 (https://github.com/thetvdb/v4-api): `POST /login` with our API key gives a bearer token valid for a month;
  `GET /series/{id}` gives a series' base record.
- Free under $50k revenue a year, on condition that every page or message showing its data credits TheTVDB with a
  direct link. The website's footer does that; keep it while this source runs.
- The licence does not cover images, so never store or show TheTVDB artwork.
