# 03 — One shared budget, and swapping which phase does the work

Two design changes this round, both worth more than a line in a changelog.

## Why the coach shares the player budget instead of getting its own

The easy version would've been: give the coach a separate $10M budget on
top of the $90M roster cap. Two independent numbers, two independent
constraints, done. Instead the cap became one shared $100M pool
(`pipeline`-side nothing changed — this is pure `draft.js`/`hub.js`), which
means **every dollar spent on a marquee coach is a dollar not spent on your
5th starter.** That's a real trade-off a player has to weigh, not two
unrelated shopping trips. It's the same reason Euroball's whole economy
works — scarcity that cuts across categories is what makes a decision
interesting; scarcity within an isolated category is just a checklist.

The mechanical trick that makes this safe: `maxAffordable()` in `draft.js`
already reserved $1 per remaining *player* slot so the draft could never
end with an unfillable slot. Adding the coach requirement meant reserving
one more dollar — `- COACH_MIN_PRICE` — so by the time all 10 players are
picked, there's *always* at least enough left for the cheapest coach. Same
pattern, one more term. When a new constraint shows up, check whether it's
actually a new instance of a pattern you already solved before writing new
code for it.

## Why the interactive quarter view moved to the playoffs

The regular season went from "12 games, each played quarter by quarter" to
"40 games, each resolved in one click, with the detailed view reserved for
the playoffs." The engine underneath (`sim.js`) didn't change at all —
`newGameEngine()` already separated *simulating* a quarter
(`playQuarter()`) from *displaying* it. All that changed is which caller
uses it: `season.js` now calls `playInstant()` (loop over all four quarters
immediately), while the interactive version — `playQuarter()` one at a
time, with a halftime pause — moved wholesale into `playoffs.js`.

This is the payoff of the phase-based architecture from lesson 02: the
simulation engine doesn't know or care which phase is calling it, so
changing *how often* a game gets the detailed treatment was a change to two
call sites, not a rewrite of the sim. If the engine had been tangled up
with the old season UI directly, this would have been a much bigger
change. Keeping "what happens" (sim.js) separate from "how it's shown"
(season.js / playoffs.js) is what made that swap cheap.

## The mid-season checkpoint reuses the Team Hub, not a new screen

At game 30, the season doesn't build a separate "make changes" screen — it
just calls `switchPhase("hub")` again, with a banner and a relabeled button
(`start-season-btn.dataset.mode = "resume"`) so the same substitution,
tactics, and coach-hiring UI you used before game 1 is available again
before game 31. `HUB` is a module-level variable that was never torn down,
so revisiting it mid-season is just... rendering it again. No new state to
manage, no new components to build. When a "new" screen would show the same
kind of information and take the same kind of input as an existing one,
check whether it's actually the existing one, entered a second time.
