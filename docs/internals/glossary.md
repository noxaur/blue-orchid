# Glossary

- **Show**: one anime series or film, as one entry in the catalog. A new season is a new show.
- **Site id**: a show's id on another site, written `site:id`, such as `anilist:154587`. A show's own id is one of
  its site ids.
- **Format**: what a show is: `tv`, `movie`, `ova`, `ona` or `special`.
- **Status**: where a show is in its run: `upcoming`, `airing`, `finished`, `hiatus` or `cancelled`.
- **Season**: the quarter a show starts in: `winter`, `spring`, `summer` or `fall`.
- **Partial date**: a date whose month or day may still be unknown: `2027`, `2027-04` or `2027-04-05`.
- **Release**: one episode becoming watchable once: a show, an episode number, a kind and a region, at one time.
- **Kind**: `raw` (the Japanese broadcast), `sub` (subtitled stream) or `dub` (dubbed stream).
- **Region**: the country a release time and its streaming links apply to. Norway first.
- **Catalog**: our stored shows and releases. Every surface reads from it.
- **Schedule source**: an outside system we pull releases from, such as AniList.
- **Catalog source**: an outside system we pull every show's details from, such as AniList.
- **Catalog slice**: the part of the catalog one import run refreshes: airing shows, upcoming shows, or the shows
  that started in one year.
- **Update**: a change to the schedule that the sync job saw: an episode scheduled or rescheduled.
- **Follow**: a chat identity asking for DMs about one show.
- **Chat identity**: a person on one chat platform, written `platform:userId`.
- **Delivery**: one update sent to one follower.
- **Platform**: a chat service the bot runs on. Discord now.
- **Reply**: what the bot answers, as data, such as `Followed` or `ShowUpdate`. Each platform draws it with its
  own view.
- **Action**: what a button or menu in a reply does, such as `unfollow`, run with the show ids the control carries.
- **Job**: work that runs on a cron schedule.
