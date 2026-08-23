# 02 — A four-phase state machine, and a simulation that doesn't cheat

## The shape of the app

Everything now routes through `app.js`'s `switchPhase(name)`. There's one
`<section class="phase">` per screen in `index.html` (draft, hub, season,
playoffs), and switching phases is nothing more than "hide every `.phase`,
un-hide the one whose id matches." Each phase's own file (`draft.js`,
`hub.js`, `season.js`, `playoffs.js`) owns its own state variable (`state`,
`HUB`, `SEASON`, `PLAYOFFS`) and its own `render...()` function — nobody
reaches into another phase's internals except to *read* the finished result
when handing off (e.g. `getDraftedSquad()` is the only thing `hub.js` takes
from `draft.js`).

This is the same "state object → one render function" pattern from lesson
00, just repeated once per screen, with a router on top deciding which
render function's output is currently visible. It's also why adding trades
and substitutions didn't require touching the draft code at all — each
phase is a closed box with one narrow door in and one narrow door out.

## Why the box score isn't just made up

The tempting shortcut for a player stat line is: pick a number that looks
plausible. `sim.js` doesn't do that. `genBoxScore()` starts every player at
their **real historical per-game average**, applies some game-to-game
noise, sums the whole team, and then rescales everyone by
`teamScore / expectedTotal` — so the box score is *derived from* the score
that was actually simulated, not decorated on top of it independently. If
your best scorer averaged 28 a game historically, they'll usually be your
leading scorer in the box score too, and the box totals always add up to
the real final score. Faking these separately (which is what Euroball
does) is faster to write but means the two numbers can quietly disagree —
a 130-point game with a box score that sums to 95.

## Why halftime bias, not a full re-simulation

The halftime choice (`chooseHalftime`) doesn't recompute the whole game —
it sets one number, `halftimeBias`, that `simQuarter()` adds into the score
differential starting in Q3. That's deliberate: the first half already
happened and shouldn't retroactively change, and a strategic choice in a
game like this should feel like *steering*, not *rerolling*. Small,
composable adjustments to an ongoing simulation, rather than tearing it
down and starting over, is the general pattern worth remembering any time
you're tempted to "just re-run it with the new setting."

## What's simplified, on purpose

- **12 games, not 82** — a full NBA season isn't playable in one sitting.
  The regular season here exists to generate standings, a playoff seed, and
  a few trade opportunities, not to be historically exhaustive.
- **Playoffs are 4 teams, not 16**, and AI-vs-AI games resolve instantly —
  you've already played the detailed quarter-by-quarter experience 12
  times by then; the bracket exists to give the season a finish line.
- **Standings track only opponents you've actually played**, not a full
  30-team league playing each other in the background. A real league sim
  would need every other team to also play a schedule — a good candidate
  for a future milestone if the standings should mean more.

None of these are bugs — they're scope decisions, written down here so
future-you (or future-us) can tell "simplified on purpose" apart from
"forgot to finish."
