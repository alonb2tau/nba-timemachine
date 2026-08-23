# 08 — Real hardware as a bonus, and a coaching dial with real teeth

## The league-leader signal was already sitting in a page we'd already scraped

"Give a bonus for leading a major stat" sounded like it needed new data —
league-wide leaderboards for points, rebounds, assists. It didn't: the
season index page (`cache/raw/{year}.html`) that `parse_awards()` already
reads for the champion/MVP/ROY blurb has three more lines in the same
paragraph — `PPG Leader`, `RPG Leader`, `APG Leader`, `WS Leader` — each
linking straight to the leader's BBRef player page. Matching on the BBRef
*code* out of that link (`curryst01`), not the display name, means it
can't be fooled by an accented name or a suffix mismatch — same reasoning
as chemistry.js's history index. Coach of the Year needed one new page,
but only one: `basketball-reference.com/awards/coy.html` lists every
winner, every season, in a single table — one request, not one per year,
cached once in `cache/raw/coy.html` and never fetched again.

## Awards as points, not a lookup table per award

BBRef's own `awards` column is already a compact, parseable format:
`"MVP-2,DPOY-11,AS,NBA1"` — comma-separated tokens, a dash-rank for
voting-based awards (rank 1 is the winner) and no dash for team
selections (All-Star, All-NBA, All-Defense). `accolades.js` reads that
format directly with one regex instead of needing per-award parsing
logic, and scores every token through two small tables: a "how much does
winning vs. finishing top-5 vs. just appearing on the ballot matter" tier
table for ranked awards, and a flat point value for team selections. A
real historical accolade always resolves to a number this way, no special
casing per player.

## The bonus is weighted by where you actually drafted the player

A real MVP season is real regardless of what slot a fantasy GM puts that
player in — but the accolades bonus is still weighted 75/25
starters/bench, same as team rating and team stats. That's a deliberate
choice, not an oversight: without it, stacking MVP-tier players eleven
deep on the bench for pure bonus-farming would be a dominant, silly
strategy. Weighting it the same way as everything else in the roster
keeps "who gets real minutes" the thing that matters, which is also just
more true to basketball.

## Six tactics instead of three, and one of them isn't cosmetic

The three new Game Plan dials (ball movement, rebounding, bench usage)
follow the same shape as the original three — a key in `TACTIC_DEFS`, three
options, a small multiplier applied in `teamStrength()` — except
**bench usage**, which doesn't touch a multiplier at all. It changes the
*weight split itself* — `squadRating()` and `squadStatLine()` now take an
optional rotation key and look up `{starters, bench}` weights from
`TACTIC_DEFS.rotation` instead of a fixed 75/25 constant. "Ride the
starters" (85/15) vs. "Go deep on the bench" (65/35) is a real strategic
choice with a directly verifiable effect: a team with a stronger bench
than starting five gets measurably stronger going deep, and vice versa —
confirmed by toggling it live and watching Team Rating move by exactly the
amount the math predicts.
