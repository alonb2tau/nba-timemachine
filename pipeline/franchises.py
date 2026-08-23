"""
Maps every Basketball-Reference team tricode that has ever appeared in our
season range (2001-2026) to one stable franchise. BBRef changes a team's
tricode when it relocates or rebrands, but it's still "the same team" for
this game — we don't want the Seattle SuperSonics and OKC Thunder showing up
as two unrelated clubs with 9 seasons each instead of one club with 25.

If a new season we scrape has a tricode not listed here, parse.py will raise
loudly rather than silently dropping it or making up a new franchise.

Conference/division use the current (post-2004) alignment throughout, even
for older seasons — this game cares about the league *structure* feeling
like an ordinary NBA season, not about reproducing exactly which division a
team sat in in 2003. `nba_id` is NBA.com's stable numeric team id, used to
build team logo URLs — it stays with the franchise across a relocation
(Seattle and OKC share one id), the same way our own franchise codes do.
"""

# franchise_code -> display info
FRANCHISES = {
    "ATL": {"name": "Atlanta Hawks", "colors": ["#E03A3E", "#26282A"], "nba_id": 1610612737, "conf": "East", "div": "Southeast"},
    "BOS": {"name": "Boston Celtics", "colors": ["#007A33", "#BA9653"], "nba_id": 1610612738, "conf": "East", "div": "Atlantic"},
    "BKN": {"name": "Brooklyn Nets", "colors": ["#000000", "#FFFFFF"], "nba_id": 1610612751, "conf": "East", "div": "Atlantic"},
    "CHA": {"name": "Charlotte Hornets", "colors": ["#1D1160", "#00788C"], "nba_id": 1610612766, "conf": "East", "div": "Southeast"},
    "CHI": {"name": "Chicago Bulls", "colors": ["#CE1141", "#000000"], "nba_id": 1610612741, "conf": "East", "div": "Central"},
    "CLE": {"name": "Cleveland Cavaliers", "colors": ["#860038", "#FDBB30"], "nba_id": 1610612739, "conf": "East", "div": "Central"},
    "DAL": {"name": "Dallas Mavericks", "colors": ["#00538C", "#002B5E"], "nba_id": 1610612742, "conf": "West", "div": "Southwest"},
    "DEN": {"name": "Denver Nuggets", "colors": ["#0E2240", "#FEC524"], "nba_id": 1610612743, "conf": "West", "div": "Northwest"},
    "DET": {"name": "Detroit Pistons", "colors": ["#C8102E", "#1D42BA"], "nba_id": 1610612765, "conf": "East", "div": "Central"},
    "GSW": {"name": "Golden State Warriors", "colors": ["#1D428A", "#FFC72C"], "nba_id": 1610612744, "conf": "West", "div": "Pacific"},
    "HOU": {"name": "Houston Rockets", "colors": ["#CE1141", "#000000"], "nba_id": 1610612745, "conf": "West", "div": "Southwest"},
    "IND": {"name": "Indiana Pacers", "colors": ["#002D62", "#FDBB30"], "nba_id": 1610612754, "conf": "East", "div": "Central"},
    "LAC": {"name": "LA Clippers", "colors": ["#C8102E", "#1D428A"], "nba_id": 1610612746, "conf": "West", "div": "Pacific"},
    "LAL": {"name": "Los Angeles Lakers", "colors": ["#552583", "#FDB927"], "nba_id": 1610612747, "conf": "West", "div": "Pacific"},
    "MEM": {"name": "Memphis Grizzlies", "colors": ["#5D76A9", "#12173F"], "nba_id": 1610612763, "conf": "West", "div": "Southwest"},
    "MIA": {"name": "Miami Heat", "colors": ["#98002E", "#F9A01B"], "nba_id": 1610612748, "conf": "East", "div": "Southeast"},
    "MIL": {"name": "Milwaukee Bucks", "colors": ["#00471B", "#EEE1C6"], "nba_id": 1610612749, "conf": "East", "div": "Central"},
    "MIN": {"name": "Minnesota Timberwolves", "colors": ["#0C2340", "#236192"], "nba_id": 1610612750, "conf": "West", "div": "Northwest"},
    "NOP": {"name": "New Orleans Pelicans", "colors": ["#0C2340", "#B4975A"], "nba_id": 1610612740, "conf": "West", "div": "Southwest"},
    "NYK": {"name": "New York Knicks", "colors": ["#006BB6", "#F58426"], "nba_id": 1610612752, "conf": "East", "div": "Atlantic"},
    "OKC": {"name": "Oklahoma City Thunder", "colors": ["#007AC1", "#EF3B24"], "nba_id": 1610612760, "conf": "West", "div": "Northwest"},
    "ORL": {"name": "Orlando Magic", "colors": ["#0077C0", "#000000"], "nba_id": 1610612753, "conf": "East", "div": "Southeast"},
    "PHI": {"name": "Philadelphia 76ers", "colors": ["#006BB6", "#ED174C"], "nba_id": 1610612755, "conf": "East", "div": "Atlantic"},
    "PHO": {"name": "Phoenix Suns", "colors": ["#1D1160", "#E56020"], "nba_id": 1610612756, "conf": "West", "div": "Pacific"},
    "POR": {"name": "Portland Trail Blazers", "colors": ["#E03A3E", "#000000"], "nba_id": 1610612757, "conf": "West", "div": "Northwest"},
    "SAC": {"name": "Sacramento Kings", "colors": ["#5A2D81", "#63727A"], "nba_id": 1610612758, "conf": "West", "div": "Pacific"},
    "SAS": {"name": "San Antonio Spurs", "colors": ["#C4CED4", "#000000"], "nba_id": 1610612759, "conf": "West", "div": "Southwest"},
    "TOR": {"name": "Toronto Raptors", "colors": ["#CE1141", "#000000"], "nba_id": 1610612761, "conf": "East", "div": "Atlantic"},
    "UTA": {"name": "Utah Jazz", "colors": ["#002B5C", "#F9A01B"], "nba_id": 1610612762, "conf": "West", "div": "Northwest"},
    "WAS": {"name": "Washington Wizards", "colors": ["#002B5C", "#E31837"], "nba_id": 1610612764, "conf": "East", "div": "Southeast"},
}

# every historical tricode BBRef has used in our range -> the franchise code above
TRICODE_TO_FRANCHISE = {
    # relocations / rebrands
    "NJN": "BKN",  # New Jersey Nets -> Brooklyn Nets (2012)
    "SEA": "OKC",  # Seattle SuperSonics -> OKC Thunder (2008)
    "VAN": "MEM",  # Vancouver Grizzlies -> Memphis (2001, edge of our range)
    "CHH": "NOP",  # Charlotte Hornets (old) -> New Orleans (2002)
    "NOH": "NOP",  # New Orleans Hornets
    "NOK": "NOP",  # New Orleans/OK City Hornets (post-Katrina, 2005-07)
    "CHO": "CHA",  # Charlotte Bobcats renamed Hornets in 2015; BBRef used CHO briefly
    "CHB": "CHA",  # Charlotte Bobcats (early tricode variant)
    "PHX": "PHO",  # Phoenix Suns alt tricode some scrapes use
    "BRK": "BKN",  # Brooklyn Nets alt tricode BBRef uses on some pages
}

import re

# rows to always drop: combined season totals for players traded mid-season.
# BBRef marks these "TOT" or "NTM" (N = number of teams that season) — a
# player can in principle be dealt many times, so match the pattern rather
# than enumerating "2TM", "3TM", "4TM", ... one at a time.
_MULTI_TEAM_RE = re.compile(r"^\d+TM$")


def is_multi_team_marker(tricode: str) -> bool:
    return tricode == "TOT" or bool(_MULTI_TEAM_RE.match(tricode))


def resolve_franchise(tricode: str) -> str:
    """Map any BBRef tricode we might encounter to a stable franchise code."""
    if tricode in FRANCHISES:
        return tricode
    if tricode in TRICODE_TO_FRANCHISE:
        return TRICODE_TO_FRANCHISE[tricode]
    raise KeyError(
        f"Unknown team tricode {tricode!r} — add it to FRANCHISES or "
        f"TRICODE_TO_FRANCHISE in pipeline/franchises.py"
    )
