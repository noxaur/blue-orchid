# source-wikidata

Wikidata as the catalog source. Imports `core`, `domain` and `effect`.
Each catalog slice is one query that finds its items, then flat detail queries for 50 items at a time, sent as POST
and decoded with a Schema. Keep detail queries flat: a nested GROUP BY loses its VALUES and times out. Wikidata is CC0, so we may keep and pass on
everything. Its query service asks for a User-Agent with a contact page and limits each query to 60 seconds.
