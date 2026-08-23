"""
Downloads raw HoopsHype "NBA 2K ratings by team" HTML pages and caches them
to disk — the same caching discipline as fetch.py, so a slow ~480-request
scrape (30 teams x 16 seasons) only ever runs once.

HoopsHype tracks 2K ratings per team-per-game-year at a stable URL:
    /nba-2k/players/?game=nba-2k{YY}&team={slug}
where {slug} must be the team's HISTORICAL display name for that season
(e.g. "new-jersey-nets" pre-2012, "brooklyn-nets" 2012+) — querying with the
wrong-era slug silently returns an unrelated "top players" fallback list, so
this reads each season's own team name straight out of data/seasons/*.json
(the same historical name Basketball-Reference gave it) instead of guessing
from the modern franchise map.

Usage:
    python pipeline/fetch_2k.py 2011 2026     # inclusive BBRef-year range
"""
import json
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
SEASONS_DIR = ROOT / "data" / "seasons"
CACHE_DIR = ROOT / "cache" / "raw_2k"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
SLEEP_SECONDS = 1.5

BASE = "https://www.hoopshype.com/nba-2k/players/"


def slugify(name: str) -> str:
    s = name.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def game_tag(year: int) -> str:
    """BBRef year (season-end year) -> HoopsHype's 2K game slug, e.g. 2016 -> 'nba-2k16'."""
    return f"nba-2k{year % 100:02d}"


def cache_path(year: int, tricode: str) -> Path:
    return CACHE_DIR / f"{year}_{tricode}.html"


def fetch_team_page(year: int, tricode: str, team_name: str) -> Path:
    dest = cache_path(year, tricode)
    if dest.exists():
        print(f"  [cached] {dest.name}")
        return dest
    slug = slugify(team_name)
    url = f"{BASE}?game={game_tag(year)}&team={slug}"
    print(f"  [fetch]  {tricode} ({team_name!r} -> {slug}) {url}")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    dest.write_text(resp.text, encoding="utf-8")
    time.sleep(SLEEP_SECONDS)
    return dest


def fetch_season(year: int) -> None:
    path = SEASONS_DIR / f"{year}.json"
    if not path.exists():
        print(f"skip {year}: no data/seasons/{year}.json — run pipeline/parse.py first")
        return
    season = json.loads(path.read_text())
    print(f"season {season['label']} ({game_tag(year)}):")
    for tricode, team in season["teams"].items():
        fetch_team_page(year, tricode, team["name"])


def main() -> None:
    if len(sys.argv) == 2:
        years = [int(sys.argv[1])]
    elif len(sys.argv) == 3:
        years = list(range(int(sys.argv[1]), int(sys.argv[2]) + 1))
    else:
        print(__doc__)
        sys.exit(1)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for year in years:
        fetch_season(year)


if __name__ == "__main__":
    main()
