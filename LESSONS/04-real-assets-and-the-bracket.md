# 04 — Real photos for free, and a bracket that resolves itself

## The photo trick: reuse data you already scraped

The instinct when someone says "I want to see the players' faces" is to go
scrape another few thousand pages. We didn't, and it's worth understanding
why that wasn't necessary.

Two facts, found by testing rather than assuming:

1. Basketball-Reference's headshot URLs look like
   `.../req/202605210/images/headshots/jamesle01.jpg` — that long number is
   a version/cache-bust segment. Swapping it for `000000000` still returns
   the same image. It's decorative, not a real parameter.
2. The player *code* (`jamesle01`) that URL needs was already sitting in
   the per-game table we'd been parsing all along, as the
   `data-append-csv` attribute on each row — we just weren't reading it.

Put together: every player row we'd already scraped could become a real
photo URL, built entirely in the browser, with zero additional HTTP
requests to Basketball-Reference. `pipeline/parse.py` now saves that code;
`web/js/assets.js` builds the URL from it at render time.

Coverage isn't total — obscure 2001 bench players often have no photo on
BBRef at all, confirmed by testing an actual one (Garth Joseph, 2000-01
Grizzlies) against a star (LeBron) and finding only the star has a
`media-item` photo block on his page. The fix isn't more scraping, it's
handling the gap honestly: every `<img>` carries `onerror`, and it swaps to
a generated initials avatar the instant the photo 404s. Real face when one
exists, clean fallback when it doesn't — decided per-player, at zero
scraping cost, by the browser itself.

## Why the bracket doesn't need you to click through 29 other teams' games

A full NBA postseason is two 10-team play-in fields plus a 16-team bracket
— dozens of games. Almost none of them involve you. The design in
`playoffs.js` is built around one rule: **a game only pauses for input if
you're actually in it.**

`ensureConferenceProgress()` walks the whole bracket structure — play-in,
round 1, conference semis, conference finals — and for every matchup that's
*ready to be played* (both participants known) and *doesn't include you*,
it resolves it immediately with a single quick scoring formula. No box
score, no quarters, no waiting — because nobody's watching that game.

`findUserAction()` then does one job: scan the same structure for the
first unresolved matchup that *does* include you. That's the only thing
the UI ever asks you to click "Tip off" on. The rest of the bracket fills
itself in around your own results, correctly, because `ensureConference-
Progress()` re-runs after every single result (yours or an AI's) and only
ever builds the next round once both feeder series actually have a winner.

This is the same principle from lesson 04's ancestor, lesson 02
(simulate vs. display are separate concerns), pushed one level up: here
it's *whose game is it* that decides whether it's simulated or shown, and
that decision is made fresh after every result rather than planned out in
advance. Trying to pre-compute "which of these 47 playoff games will the
user need to see" before the tournament starts would have been far more
complex than just asking the question every time something finishes.

## The league you don't play is real data, not a simulation

The other 29 teams' regular-season win-loss records aren't simulated at
all — each AI team is a real historical (team, season) snapshot (2010
Lakers, 2016 Warriors, whichever one got drawn), and their standings entry
at any point in your season is just `round(realWinPct * gamesSoFar)`. It's
a pure function, not a running simulation — no state to advance, no bugs
from 29 parallel game engines, and the numbers are honest: if it says the
Lakers are 41-17, that's their real 2010 pace, not a random number that
happens to look plausible. Reaching for "just fake it with a formula" only
works because the *real* data was sitting right there to build the formula
from — worth noticing when a shortcut is legitimate versus when it's
cutting a corner that matters.
