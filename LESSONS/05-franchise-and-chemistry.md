# 05 — Playing as a real team, and history that pays off

## Owning a franchise slot simplified the league, it didn't complicate it

Before this round, "you" were an extra, 31st entrant bolted onto a random
conference — a workable hack, but a hack. Once the ask became "let me pick
a real franchise," the fix wasn't just cosmetic. `league.js`'s
`drawAiLeague()` now excludes `FRANCHISE.code` from the 29 AI teams
up front:

```js
const codes = allFranchiseCodes().filter(c => c !== FRANCHISE.code);
```

That one line means the league is a real 30 teams again — you plus 29 real
franchises, not 31 crammed into 30 slots. Your conference and division stop
being a coin flip (`pickYourConference()`, now deleted) and become
`FRANCHISE.conf` / `FRANCHISE.div`, read straight from the same scraped
data every AI team uses. A feature that sounds like it adds a step
(choose a franchise first) actually removed a structural workaround. Worth
noticing when a new requirement is a chance to delete code, not just add it.

## Chemistry: real history, cross-referenced once, in the browser

The engine asks a simple factual question — "were these two people *really*
on the same team in the same year?" — and it can answer that question for
free because every season is already sitting in `SEASONS_CACHE` by the time
the draft starts (`preloadAllSeasons()` runs before you pick a single
player). `chemistry.js`'s `buildHistoryIndexes()` is one pass over data
already in memory: for every player code and every coach code, record every
`(franchise, year)` they actually appeared in. `chemistryLinks()` then just
checks two players' — or a player's and the coach's — histories for a
shared entry.

No new scrape, no new server round-trip, no guessing. When the roster
screen says "Monta Ellis & Chris Webber — Golden State Warriors 2007-08,"
that's not flavor text, it's a real fact pulled from the same rows that
gave Ellis his 25.5 PPG. It happened to surface on a *random* test draft
with no attempt to engineer it — which is the best kind of confirmation
that the index is finding real relationships, not coincidences.

## The pre-game choice reuses the halftime mechanic instead of inventing a new one

`sim.js` already had `applyHalftimeBias()`, which nudges the score
differential for quarters 3-4. The new pre-game decision
(`applyPregameBias()`) is the same idea pointed at quarters 1-2 — same
`simQuarter()` math, same `PREGAME_CHOICES` / `HALFTIME_CHOICES` shape, just
a different half of the game and a different moment it's offered. Once one
"a decision biases the next stretch of quarters" mechanic existed, the
second one was a few lines, not a new system. The playoffs screen puts it
front and center — clicking a pre-game choice *is* the tip-off action now,
so the "compelling, decision-heavy" panel the game asked for didn't need a
separate button plus a separate decision; one click does both.
