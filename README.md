# NBA Time Machine

A dream-team drafting game across 16 seasons of NBA history (2010-11 → 2025-26),
inspired by [Euroball Time Machine](https://euroball.netlify.app/). Draft real
players — rated with their actual NBA 2K overall where the game covered them,
a computed rating otherwise — and a real head coach from history, then either
run a full 82-game NBA season solo, or draft against up to 4 friends in a
shareable-link Quick League and settle it with a head-to-head duel.

## Project layout

```
pipeline/          Python data pipeline (scrape → parse → rate)
  fetch.py          downloads & caches raw Basketball-Reference HTML
  fetch_2k.py       downloads & caches raw HoopsHype NBA 2K ratings pages
  parse.py          turns cached HTML into data/seasons/*.json
  franchises.py     tricode → franchise map, NBA team ids, conference/division
  ratings.py        era-normalized 0-99 rating + draft price per player + coach
  ratings_2k.py     parses cached 2K ratings, matched onto players by name
cache/raw/          cached HTML, gitignored — fetch.py never re-downloads a cached page
cache/raw_2k/       cached 2K ratings pages, gitignored, same caching discipline
data/seasons/       one JSON file per season, what the frontend actually reads
server/app.py       tiny FastAPI server: serves web/ + /api/seasons endpoints
server/leagues.py   Quick League multiplayer: in-memory league/duel state + API
web/                the game itself — plain HTML/CSS/JS, no build step
  js/assets.js       real photo/logo URLs with generated-avatar fallback
  js/league.js       conference/division structure, 82-game schedule, standings
  js/sim.js          the game engine (quarters, box scores, coach/tactics effects)
  js/playoffs.js     Play-In Tournament + best-of-7 bracket, auto-resolves AI games
  js/duel.js         Quick League: create/join a league, draft, head-to-head duels
LESSONS/            numbered docs explaining how each part works
```

## Running it

```bash
source venv/bin/activate
uvicorn server.app:app --app-dir . --port 8000
```

Then open http://127.0.0.1:8000

## Re-running the data pipeline

```bash
source venv/bin/activate
python pipeline/fetch.py 2011 2026        # downloads to cache/raw/ (skips what's cached)
python pipeline/fetch_2k.py 2011 2026     # downloads to cache/raw_2k/ (skips what's cached)
python pipeline/parse.py 2011 2026        # cache/raw*/ -> data/seasons/*.json
```

The season range is 2010-11 → 2025-26 — the window where NBA 2K's own
ratings are reliably documented (`SEASON_MIN_YEAR` in `server/app.py`).
Older seasons can still be scraped/parsed, they're just not served.

## How it plays

**Mode** — play solo, or create/join a **Quick League**: up to 5 people via
a shareable link, each drafting their own franchise, then settling it in
head-to-head duels (see the Quick League section below).

0. **Franchise** — pick one of the 30 real NBA franchises to run (its real
   conference, division, colors and logo carry through the whole season)
   and name your team. The other 29 real franchises fill out the league
   around you, each a fixed historical snapshot.
1. **Draft** — draw a random (season, team); pick one player into an open
   G/G/F/F/C slot, or hire that team's real historical head coach, from a
   shared $100M cap (10 players + 1 coach). Every player is rated with
   their **real NBA 2K overall** for that season where HoopsHype's archive
   covers them (about 82% of the player pool from 2010-11 on), and the
   computed era-normalized rating otherwise — both feed the same price
   curve, so the budget stays consistent either way. A coach's price and
   team-strength bonus come from how they actually did that season,
   **regular season and playoffs both** (a coach who won it all is worth
   more than one who matched the record and got bounced early). Real
   photos where Basketball-Reference has one, a generated avatar where it
   doesn't. Players (or a coach) who were real historical teammates build
   **chemistry** — a roster with genuine shared history plays better than
   the same ratings with strangers, shown as a live SRS bonus in the Team
   Hub. Real hardware counts too — an MVP season, an All-NBA/All-Defense
   selection, leading the league in a major stat, a coach who actually won
   Coach of the Year, all add a genuine **accolades bonus**, weighted by
   whether that player is actually in your starting five.
2. **Team Hub** — substitute starters/bench (same-position swaps) and set a
   six-field game plan: pace, shot selection, defensive scheme, ball
   movement, rebounding emphasis, and bench usage. Bench usage isn't
   cosmetic — it actually shifts how much of your team rating comes from
   the starting five vs. the bench (75/25 by default; "ride the starters"
   or "go deep on the bench" move that split for real). The coach is
   locked in from the draft — real teams don't fire a coach mid-season
   here.
3. **Season** — a real 82-game NBA season. The schedule is weighted the
   way a real slate is (division rivals most, the other conference least).
   Games resolve in bulk with no per-game summary — you watch the
   standings move, not each box score. The season pauses exactly once, at
   the All-Star break / trade deadline, for a couple of trade offers and a
   trip back to the Team Hub.
4. **Playoffs** — the real structure: a 7-10 seed Play-In Tournament in
   each conference, then a best-of-7 bracket (Round 1 → Conference Semis →
   Conference Finals → NBA Finals), laid out ESPN-style — both conferences
   converging on a center Finals card. The screen is built around your own
   games: a "Game Day" panel up top with the matchup, series stakes, and a
   pre-game decision that doubles as tip-off. If a game is still within 5
   points after regulation, it pauses for one more decision — **who takes
   the final shot** — with each candidate's real shooting splits shown so
   the choice is informed, not a coin flip. The complete bracket sits below
   as reference — every game you're not in resolves itself instantly.
5. **Season Recap** — a real end-of-run summary: record, conference seed,
   win streaks, team statistical leaders, the full playoff run (series by
   series), every clutch shot taken, and a front-office summary (coach,
   chemistry). Champion runs get a gold trophy treatment.

## Quick League (multiplayer)

Create a league from the mode-select screen and you get a shareable
code/link — send it to up to 4 friends. Everyone picks a different real
franchise and drafts their own roster independently (no waiting on each
other). Once two or more players are ready, every pair plays one duel:
whoever opens it first plays it live (tip-off choice, quarter-by-quarter,
halftime call, a clutch shot if it's tight) against the other player's
*real* drafted roster — both sides get a genuine box score, not a
fabricated one. The other player sees the final result once it's posted.
Standings track wins/losses across all the duels in the league.

There's no account system and no database — a league is an in-memory
record on the server for as long as it keeps running (`server/leagues.py`),
which is the right amount of persistence for something meant to be quick.
See `LESSONS/07` for how the multiplayer sync actually works (or rather,
how little of it there needed to be).

## Status

**Milestones 3-6 done**, plus real assets, full league authenticity, real
franchise selection, a historical-chemistry system, an ESPN-style bracket,
a clutch-shot mechanic, a full season recap, real NBA 2K ratings, Quick
League multiplayer, a real-accolades bonus system, and a six-field game
plan (see the plan and `LESSONS/02` through `LESSONS/08`).
Not yet built: career mode (multi-season, keep/retain), daily challenge,
leaderboards, real hosting. For now, sharing the app outside this machine
means running a tunnel alongside the server:

```bash
./.bin/cloudflared tunnel --url http://127.0.0.1:8000
```

`.bin/cloudflared` is a downloaded binary (gitignored, not committed) — see
`pipeline/fetch_2k.py`'s neighbor `.bin/` folder. This prints a temporary
`trycloudflare.com` URL with no account needed; it dies when the tunnel
process (or this machine) stops, so it's for sharing a live session, not
permanent hosting.
