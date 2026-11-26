# source-thetvdb

TheTVDB (API v4) as the catalog source and the schedule source. Imports `core`, `domain` and `effect`.
Each run signs in with `THETVDB_API_KEY`, looks up the Anime genre and series statuses by name (TheTVDB asks not to
hard-code their ids), and searches `/series/filter` for Japanese anime. Times are Tokyo time, UTC+9. Episodes are
numbered by their absolute number, so seasons never share a release key. The free key requires a visible link to
TheTVDB wherever its data is shown, does not cover artwork, and forbids passing the data on:
https://thetvdb.com/api-information and https://thetvdb.com/tos
