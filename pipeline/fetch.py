"""
Downloads raw Basketball-Reference HTML pages and caches them to disk.

Run this once per season you want. It NEVER re-fetches a page that's already
cached in cache/raw/ — so you can run parse.py a hundred times while you're
debugging without hitting the network again. If a page looks wrong, delete
its file from cache/raw/ and re-run this script to force a fresh download.

Usage:
    python pipeline/fetch.py 2024          # one season
    python pipeline/fetch.py 2001 2026     # inclusive range
"""
import sys
import time
from pathlib import Path

import requests

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache" / "raw"
BASE = "https://www.basketball-reference.com/leagues/NBA_{year}{suffix}.html"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
SLEEP_SECONDS = 4  # be polite — BBRef rate-limits aggressively

PAGES = {
    "index": "",  # team records, champion, MVP, stat leaders
    "per_game": "_per_game",
    "advanced": "_advanced",
    "coaches": "_coaches",  # real head coach per team per season, for the draft
}


def cache_path(year: int, page: str) -> Path:
    return CACHE_DIR / f"{year}_{page}.html"


def fetch_page(year: int, page: str) -> Path:
    """Return the cache path for this page, downloading it first if needed."""
    dest = cache_path(year, page)
    if dest.exists():
        print(f"  [cached] {dest.name}")
        return dest

    url = BASE.format(year=year, suffix=PAGES[page])
    print(f"  [fetch]  {url}")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    # BBRef serves UTF-8 (confirmed via its Content-Type header), but requests'
    # auto-detection occasionally guesses wrong and mangles accented names
    # (e.g. "Fernández" -> "FernÃ¡ndez"). Don't leave it to guesswork.
    resp.encoding = "utf-8"
    dest.write_text(resp.text, encoding="utf-8")
    time.sleep(SLEEP_SECONDS)
    return dest


def fetch_season(year: int) -> None:
    # BBRef's "year" is the season's END year: NBA_2026 == the 2025-26 season.
    print(f"season {year - 1}-{str(year)[-2:]}:")
    for page in PAGES:
        fetch_page(year, page)


def fetch_coy() -> None:
    """One-time, all-years-at-once fetch: every real Coach of the Year
    winner, keyed by season on the page itself — so this is a single
    request total, not one per season."""
    dest = CACHE_DIR / "coy.html"
    if dest.exists():
        print(f"  [cached] {dest.name}")
        return
    url = "https://www.basketball-reference.com/awards/coy.html"
    print(f"  [fetch]  {url}")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    resp.encoding = "utf-8"
    dest.write_text(resp.text, encoding="utf-8")
    time.sleep(SLEEP_SECONDS)


def main() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) == 2:
        years = [int(sys.argv[1])]
    elif len(sys.argv) == 3:
        lo, hi = int(sys.argv[1]), int(sys.argv[2])
        years = list(range(lo, hi + 1))
    else:
        print(__doc__)
        sys.exit(1)

    fetch_coy()
    for y in years:
        fetch_season(y)


if __name__ == "__main__":
    main()
