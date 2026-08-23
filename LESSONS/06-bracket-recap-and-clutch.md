# 06 — Matching a real layout, and a bug a naive test would have hidden

## Copying ESPN's bracket meant copying its *structure*, not its pixels

The brief was "make the bracket look exactly like ESPN's." The useful move
wasn't screenshotting their page and eyeballing colors — it was fetching
the actual page and reading its *DOM order*: round headers, then West
series top-to-bottom, then a center Finals card, then East series. That
order turned out to already match how `playoffs.js` builds `round1`
(`[1v8, 4v5, 3v6, 2v7]`) — the seeding pairs on ESPN's page are in the same
order our bracket was already constructed in. Once that was confirmed, the
CSS problem reduced to: 9 columns (4 West rounds, Finals, 4 East rounds,
mirrored), each round's cards vertically centered relative to the pair
that fed it.

That centering is a known CSS trick, not a custom layout engine: put every
round in one CSS Grid row (`align-items: stretch` makes every column the
same height as the tallest one — Round 1's four cards), then give each
column `display: flex; flex-direction: column; justify-content: space-
around`. Round 1's four cards fill the height edge-to-edge; Round 2's two
cards, in a column of the *same* height, automatically land centered
between the pairs that produced them; the Conference Final's one card
centers itself the same way. No connector lines, no manual positioning
math — the bracket shape falls out of "same height, evenly spaced,"
one round at a time.

## A bug that only showed up because a test kept clicking

The clutch-shot feature broke on the very first test run: `takeClutchShot()`
resolved a shot but never turned `awaitingClutch` back to `false`. In
isolation — one click, look at the result — this was invisible; the result
screen rendered fine. It only surfaced because the first test loop kept
calling the same action every iteration until the game state changed, and
since `awaitingClutch` was still `true`, the loop just... took the shot
again. And again. Four thousand times before the guard rail stopped it.

The real bug wasn't the test loop — it was that `renderPoLive()` had no
way to distinguish "show the picker" from "show the result of the pick
that was just made," because both were governed by the same one boolean.
The fix was adding a second state (`showingClutchResult`) so the two
screens can't collapse into each other no matter how or how often
rendering gets re-triggered. A bug that a single manual click-through
wouldn't have caught is exactly the kind a scripted "play the whole thing
end to end, repeatedly, fast" test is for — the value isn't testing the
happy path once, it's testing what happens when the same state gets
revisited, which is precisely what a real player mashing buttons (or a
future feature calling render at an unexpected time) would eventually do.

## The recap reuses data instead of inventing it

Nothing in `finishRun()`'s season recap required new bookkeeping beyond a
few counters. Team leaders come straight from the real per-game stats
already on each player. The playoff run timeline is just `PLAYOFFS.seriesLog`
— a list that was already being appended to every time a series ended,
now read back instead of thrown away. The only new tracking is genuinely
new information: win/loss streaks and margins, which didn't exist anywhere
because bulk-simulated regular season games never had a place to record
them (`simulateGamesBulk()` now updates a few counters per game — cheap,
no box scores needed). When a "new" summary screen needs data, check what's
already being computed and just discarded before adding a new subsystem to
produce it again.
