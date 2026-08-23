"""
Parses cached HoopsHype pages (fetch_2k.py) into name -> NBA 2K overall
rating lookups, one per (season, team), and matches them onto the players
parse.py already extracted from Basketball-Reference.

Real 2K ratings are a straight swap-in for the computed rating: they're
built from the same 0-99 "overall" scale, so the draft price curve (which
expects a 0-99 input) doesn't need to change, just what feeds it.
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CACHE_2K = ROOT / "cache" / "raw_2k"

_SUFFIX_RE = re.compile(r"\b(jr|sr|ii|iii|iv)\.?$")


def normalize_name(name: str) -> str:
    """Fold accents/punctuation/suffixes so 'J.J. Hickson' == 'Jj Hickson'."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = s.lower().replace(".", "").replace("'", "").replace("-", " ")
    s = _SUFFIX_RE.sub("", s).strip()
    return re.sub(r"\s+", " ", s)


def parse_2k_page(html: str) -> dict[str, int]:
    """name (normalized) -> 2K overall rating, for every player with a
    numeric rating on this cached team-season page."""
    soup = BeautifulSoup(html, "lxml")
    out: dict[str, int] = {}
    for a in soup.select('a[href^="/nba-2k/players/"]'):
        href = a.get("href", "")
        if href == "/nba-2k/players/":
            continue  # nav link, not a player row
        name = a.get_text(strip=True)
        if not name:
            continue
        tr = a.find_parent("tr")
        if not tr:
            continue
        tds = tr.find_all("td")
        if not tds:
            continue
        rating_text = tds[-1].get_text(strip=True)
        if not rating_text or not rating_text.isdigit():
            continue  # "-" — this player wasn't rated in this game
        out[normalize_name(name)] = int(rating_text)
    return out


def load_2k_ratings(year: int, tricode: str) -> dict[str, int]:
    """Cached 2K ratings for one (season, team), or {} if never fetched /
    the page came back empty (falls back to the computed rating upstream)."""
    path = CACHE_2K / f"{year}_{tricode}.html"
    if not path.exists():
        return {}
    return parse_2k_page(path.read_text(encoding="utf-8"))
