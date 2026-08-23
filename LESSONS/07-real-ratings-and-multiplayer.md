# 07 — Real ratings from a second source, and multiplayer without a database

## Finding a source that actually has 16 years of history

"Use real NBA 2K ratings" sounds like one data source, but it isn't: 2K
never rates coaches, and most "NBA 2K ratings" sites online only track the
*current* game's roster — searching `2kratings.com` for an old game year
just redirects to this year's top-100 list. The one source that actually
works is HoopsHype's per-player history page
(`hoopshype.com/nba-2k/players/{slug}/{id}/`), which lists every season a
player has been in the game with that year's real rating. From there, the
site also serves a per-*team*-per-*game-year* roster page
(`?game=nba-2k16&team=cleveland-cavaliers`) — one request per (season,
team) instead of one per player, the same 30-teams-at-a-time shape
`pipeline/parse.py` already works in.

The trap: that `team=` slug has to be the team's *historical* name for
that season, not its current one. Querying `team=brooklyn-nets` for the
2010-11 season (when they were still the New Jersey Nets) doesn't 404 —
it silently falls back to a generic "top players" list, which would have
quietly attached Kobe Bryant and LeBron James to the wrong roster if it
had gone unnoticed. The fix was free: `data/seasons/*.json` already stores
each team's *actual* name for that season (parse_standings.py keeps
BBRef's historical label on purpose, see LESSONS/01) — `pipeline/fetch_2k.py`
reads that instead of guessing from the modern franchise map, so a
relocation-aware slug falls out for free instead of needing its own lookup
table.

## Two rating sources, one economy

Once a player has a real 2K rating, it replaces the computed one outright
— but the draft price still has to make sense against players priced from
the *other* source. `price()` in `pipeline/ratings.py` was built around a
z-scored "production" number, not a 0-99 rating. Rather than maintain two
separate pricing curves, `price_from_rating()` inverts the same formula
`overall_rating()` uses to go the other way (rating → the "blended" input
price() expects) so a real 2K 94 costs whatever a *computed* 94 would have
cost. One curve, two ways in.

## Multiplayer without adding a database

"Quick League" needed to feel real (shareable code, a real duel between
two real drafted rosters) without turning a one-file FastAPI backend into
a stateful application server. The move that kept it small: the *game
itself* never moves to the server. `server/leagues.py` only ever holds
three things — who's in the league, each player's finished roster (plain
JSON, already shaped exactly like `getDraftedSquad()` produces), and a
final score once someone submits one. The quarter-by-quarter sim, the
halftime call, the clutch shot — all of that still runs client-side,
unchanged, in whichever browser opens the duel first (the "arbiter").
Nothing about sim.js needed touching except one new function
(`newDuelEngine`) that runs the same engine symmetrically so *both* sides
get a real box score instead of one.

The tradeoff this buys: no WebSockets, no shared random seed, no
turn-by-turn sync protocol — just a plain REST API the other player polls
every couple of seconds. The cost is that only the arbiter actually plays
the game live; the other player sees the result once it's posted, not
live play-by-play. For a "quick" head-to-head between friends, that's the
right trade — and it fit in an afternoon instead of a rewrite.

## A bug that only shows up when you're not player A

The very first duel test produced a league where the player who
demonstrably won 107-99 came out of the standings 0-1. The cause:
`submitMpDuelResult()` always POSTed `aScore: myScore`, on the unstated
assumption that whoever's playing the duel is always "player A." That's
true for the league's *creator* (always seeded as A) but false for anyone
who joined — the second test, run with the joining player as arbiter, is
what actually caught it, because the first test happened to have the
creator win. The fix was storing which side the arbiter actually is
(`amA`) at claim time and mapping scores through it, instead of assuming
identity from position. Same shape of lesson as the clutch bug in
LESSONS/06: the failure only appears once you test the case that isn't
the first one you happened to try.
