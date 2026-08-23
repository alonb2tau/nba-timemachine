"""
Turns cached Basketball-Reference HTML (from fetch.py) into one clean JSON
file per season in data/seasons/.

Run after fetch.py:
    python pipeline/parse.py 2001 2026

Each season JSON looks like:
{
  "year": 2010, "label": "2009-10",
  "champion": "LAL", "mvp": "LeBron James", "roy": "Tyreke Evans",
  "teams": {
    "BOS": {
      "name": "Boston Celtics", "wins": 50, "losses": 32, "srs": 3.37,
      "pts_per_g": 99.2, "opp_pts_per_g": 95.6,
      "players": [ {name, pos, age, gp, gs, min, pts, reb, ast, stl, blk,
                     tov, fg3_pct, per, ts_pct, usg_pct, bpm, awards,
                     rating, price, ...}, ... ]
    }, ...
  }
}
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

from franchises import is_multi_team_marker, FRANCHISES, resolve_franchise
from ratings import coach_price_and_bonus, overall_rating, price, price_from_rating, season_norms
from ratings_2k import load_2k_ratings, normalize_name

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "cache" / "raw"
OUT = ROOT / "data" / "seasons"

# per_game_stats data-stat -> our field name (numeric fields only — "pos" is
# text and is pulled out separately, see parse_per_game)
PER_GAME_FIELDS = {
    "age": "age", "games": "gp", "games_started": "gs",
    "mp_per_g": "min", "pts_per_g": "pts", "trb_per_g": "reb",
    "ast_per_g": "ast", "stl_per_g": "stl", "blk_per_g": "blk",
    "tov_per_g": "tov", "orb_per_g": "oreb", "drb_per_g": "dreb",
    "fg2_pct": "fg2_pct", "fg3_pct": "fg3_pct", "ft_pct": "ft_pct",
    "fg3a_per_g": "fg3a", "fga_per_g": "fga",
}
ADVANCED_FIELDS = {
    "per": "per", "ts_pct": "ts_pct", "usg_pct": "usg_pct",
    "orb_pct": "orb_pct", "drb_pct": "drb_pct", "ast_pct": "ast_pct",
    "stl_pct": "stl_pct", "blk_pct": "blk_pct", "tov_pct": "tov_pct",
    "ws": "ws", "bpm": "bpm", "vorp": "vorp",
}


def _num(text: str) -> float | None:
    text = text.strip().lstrip("*")
    if not text or text in ("", "—"):
        return None
    try:
        return float(text)
    except ValueError:
        return None


def load_soup(year: int, page: str) -> BeautifulSoup:
    path = RAW / f"{year}_{page}.html"
    if not path.exists():
        raise FileNotFoundError(f"missing {path} — run fetch.py {year} first")
    return BeautifulSoup(path.read_text(encoding="utf-8"), "lxml")


def parse_standings(soup: BeautifulSoup) -> dict[str, dict]:
    """Team records, keyed by franchise code."""
    teams: dict[str, dict] = {}
    table_ids = ["confs_standings_E", "confs_standings_W",
                 "divs_standings_E", "divs_standings_W"]
    seen_any_confs = soup.find("table", id="confs_standings_E") is not None
    wanted = table_ids[:2] if seen_any_confs else table_ids[2:]

    for tid in wanted:
        table = soup.find("table", id=tid)
        if not table:
            continue
        for row in table.find("tbody").find_all("tr"):
            link = row.find("a", href=True)
            if not link:
                continue  # division header row, e.g. "Atlantic Division"
            tricode = re.search(r"/teams/([A-Z]+)/", link["href"]).group(1)
            franchise = resolve_franchise(tricode)
            name_cell = row.find(["td", "th"], {"data-stat": "team_name"})
            # Keep the name BBRef shows for THIS season, not the franchise's
            # current name — the whole point of a time machine is that a
            # 2001 draw says "Seattle SuperSonics", not "OKC Thunder".
            # `franchise` (the resolved modern code) is still the grouping
            # key and the color source, since those are visual continuity,
            # not historical fact.
            name = name_cell.get_text(strip=True).rstrip("*")
            info = FRANCHISES.get(franchise, {})
            teams[franchise] = {
                "name": name,
                "colors": info.get("colors", ["#333333", "#999999"]),
                "nba_id": info.get("nba_id"),
                "conf": info.get("conf"),
                "div": info.get("div"),
                "wins": int(_num(row.find("td", {"data-stat": "wins"}).text) or 0),
                "losses": int(_num(row.find("td", {"data-stat": "losses"}).text) or 0),
                "srs": _num(row.find("td", {"data-stat": "srs"}).text) or 0.0,
                "pts_per_g": _num(row.find("td", {"data-stat": "pts_per_g"}).text) or 0.0,
                "opp_pts_per_g": _num(row.find("td", {"data-stat": "opp_pts_per_g"}).text) or 0.0,
                "coach": None,
                "players": [],
            }
    return teams


def parse_awards(soup: BeautifulSoup) -> dict[str, str | None]:
    out = {"champion": None, "mvp": None, "roy": None}
    label_map = {
        "League Champion": "champion",
        "Most Valuable Player": "mvp",
        "Rookie of the Year": "roy",
    }
    for strong in soup.find_all("strong"):
        label = strong.get_text(strip=True)
        if label in label_map:
            full = strong.parent.get_text(" ", strip=True)
            value = full.split(":", 1)[-1].strip()
            out[label_map[label]] = value
    return out


def parse_league_leaders(soup: BeautifulSoup) -> dict[str, str | None]:
    """League leaders in points/rebounds/assists/win-shares for this
    season, as BBRef player codes — pulled from the same summary blurb on
    the season index page as parse_awards(), no extra scraping needed."""
    out = {"pts": None, "reb": None, "ast": None, "ws": None}
    label_map = {"PPG Leader": "pts", "RPG Leader": "reb", "APG Leader": "ast", "WS Leader": "ws"}
    for strong in soup.find_all("strong"):
        label = strong.get_text(strip=True)
        if label not in label_map:
            continue
        link = strong.parent.find("a", href=True)
        if not link:
            continue
        m = re.search(r"/players/[a-z]/([^.]+)\.html", link["href"])
        if m:
            out[label_map[label]] = m.group(1)
    return out


def load_coy_winners() -> dict[int, str]:
    """season (BBRef end-year) -> Coach of the Year's BBRef coach code,
    from the single all-time awards page (cache/raw/coy.html) — one
    request covers every season, so this isn't fetched per-year."""
    path = RAW / "coy.html"
    if not path.exists():
        return {}
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "lxml")
    table = soup.find("table", id="coyNBA")
    if not table:
        return {}
    out = {}
    for row in table.find("tbody").find_all("tr"):
        season_cell = row.find(["th", "td"], {"data-stat": "season"})
        coach_cell = row.find(["th", "td"], {"data-stat": "coach"})
        if not season_cell or not coach_cell:
            continue
        season_link = season_cell.find("a", href=True)
        coach_link = coach_cell.find("a", href=True)
        if not season_link or not coach_link:
            continue
        ym = re.search(r"NBA_(\d+)\.html", season_link["href"])
        cm = re.search(r"/coaches/([^.]+)\.html", coach_link["href"])
        if ym and cm:
            out[int(ym.group(1))] = cm.group(1)
    return out


def parse_per_game(soup: BeautifulSoup) -> list[dict]:
    table = soup.find("table", id="per_game_stats")
    rows = []
    for row in table.find("tbody").find_all("tr"):
        team_cell = row.find("td", {"data-stat": "team_name_abbr"})
        if team_cell is None:
            continue
        tricode = team_cell.text.strip()
        if not tricode or is_multi_team_marker(tricode):
            continue  # "League Average" row, or the combined-team row for a traded player
        name_cell = row.find("td", {"data-stat": "name_display"})
        if not name_cell or not name_cell.text.strip():
            continue
        pos_cell = row.find("td", {"data-stat": "pos"})
        # data-append-csv is BBRef's own player code (e.g. "jamesle01") — the
        # same code that resolves a real headshot at a predictable URL, with
        # zero extra scraping since it's already sitting in this row.
        rec = {"name": name_cell.text.strip(), "tricode": tricode,
               "code": name_cell.get("data-append-csv"),
               "pos": pos_cell.text.strip() if pos_cell is not None else None,
               "awards": (row.find("td", {"data-stat": "awards"}) or {}).get_text(strip=True)
                         if row.find("td", {"data-stat": "awards"}) else ""}
        for stat, field in PER_GAME_FIELDS.items():
            cell = row.find("td", {"data-stat": stat})
            rec[field] = _num(cell.text) if cell is not None else None
        rows.append(rec)
    return rows


def parse_coaches(soup: BeautifulSoup) -> dict[str, dict]:
    """Real head coach per team for this season, keyed by franchise code.

    A team can have more than one coach in a season (fired/replaced
    mid-year) — BBRef gives one row per coach-team-season, so we keep
    whichever coach worked the most games that season.
    """
    table = soup.find("table", id="NBA_coaches")
    if not table:
        return {}
    best: dict[str, dict] = {}
    for row in table.find("tbody").find_all("tr"):
        coach_cell = row.find(["td", "th"], {"data-stat": "coach"})
        team_cell = row.find(["td", "th"], {"data-stat": "team"})
        if not coach_cell or not team_cell:
            continue
        tricode = team_cell.get_text(strip=True)
        if not tricode:
            continue
        try:
            franchise = resolve_franchise(tricode)
        except KeyError:
            continue
        link = coach_cell.find("a", href=True)
        code = None
        if link:
            m = re.search(r"/coaches/([^/.]+)\.html", link["href"])
            if m:
                code = m.group(1)
        cur_g = _num((row.find(["td", "th"], {"data-stat": "cur_g"}) or {}).get_text(strip=True)
                     if row.find(["td", "th"], {"data-stat": "cur_g"}) else "") or 0
        cur_w = _num((row.find(["td", "th"], {"data-stat": "cur_w"}) or {}).get_text(strip=True)
                     if row.find(["td", "th"], {"data-stat": "cur_w"}) else "") or 0
        cur_l = _num((row.find(["td", "th"], {"data-stat": "cur_l"}) or {}).get_text(strip=True)
                     if row.find(["td", "th"], {"data-stat": "cur_l"}) else "") or 0
        car_w = _num((row.find(["td", "th"], {"data-stat": "car_w"}) or {}).get_text(strip=True)
                     if row.find(["td", "th"], {"data-stat": "car_w"}) else "") or 0
        car_l = _num((row.find(["td", "th"], {"data-stat": "car_l"}) or {}).get_text(strip=True)
                     if row.find(["td", "th"], {"data-stat": "car_l"}) else "") or 0
        # "_p" = playoffs for this coach's current (this-season) stint — same
        # row, BBRef just tacks the postseason columns on after the dum-3 divider.
        cur_w_p = _num((row.find(["td", "th"], {"data-stat": "cur_w_p"}) or {}).get_text(strip=True)
                       if row.find(["td", "th"], {"data-stat": "cur_w_p"}) else "") or 0
        cur_l_p = _num((row.find(["td", "th"], {"data-stat": "cur_l_p"}) or {}).get_text(strip=True)
                       if row.find(["td", "th"], {"data-stat": "cur_l_p"}) else "") or 0
        candidate = {
            "name": coach_cell.get_text(strip=True), "code": code,
            "season_wins": int(cur_w), "season_losses": int(cur_l), "season_games": int(cur_g),
            "playoff_wins": int(cur_w_p), "playoff_losses": int(cur_l_p),
            "career_wins": int(car_w), "career_losses": int(car_l),
        }
        if franchise not in best or candidate["season_games"] > best[franchise]["season_games"]:
            best[franchise] = candidate
    return best


def parse_advanced(soup: BeautifulSoup) -> dict[tuple[str, str], dict]:
    table = soup.find("table", id="advanced")
    out = {}
    for row in table.find("tbody").find_all("tr"):
        team_cell = row.find("td", {"data-stat": "team_name_abbr"})
        if team_cell is None:
            continue
        tricode = team_cell.text.strip()
        if not tricode or is_multi_team_marker(tricode):
            continue
        name_cell = row.find("td", {"data-stat": "name_display"})
        if not name_cell or not name_cell.text.strip():
            continue
        rec = {}
        for stat, field in ADVANCED_FIELDS.items():
            cell = row.find("td", {"data-stat": stat})
            rec[field] = _num(cell.text) if cell is not None else None
        out[(name_cell.text.strip(), tricode)] = rec
    return out


def parse_season(year: int, coy_winners: dict[int, str] | None = None) -> dict:
    coy_winners = coy_winners or {}
    idx_soup = load_soup(year, "index")
    pg_soup = load_soup(year, "per_game")
    adv_soup = load_soup(year, "advanced")
    coaches_soup = load_soup(year, "coaches")

    teams = parse_standings(idx_soup)
    awards = parse_awards(idx_soup)
    leaders = parse_league_leaders(idx_soup)
    per_game_rows = parse_per_game(pg_soup)
    advanced_by_key = parse_advanced(adv_soup)
    coaches = parse_coaches(coaches_soup)
    coy_code = coy_winners.get(year)

    champion_code = None
    if awards["champion"]:
        for code, t in teams.items():
            if t["name"] == awards["champion"]:
                champion_code = code
                break

    for franchise, t in teams.items():
        c = coaches.get(franchise)
        if not c:
            continue
        coach_price, coach_bonus = coach_price_and_bonus(
            c["season_wins"], c["season_losses"],
            c["playoff_wins"], c["playoff_losses"],
            won_title=(franchise == champion_code),
        )
        t["coach"] = {
            "name": c["name"], "code": c["code"],
            "wins": c["season_wins"], "losses": c["season_losses"],
            "playoff_wins": c["playoff_wins"], "playoff_losses": c["playoff_losses"],
            "career_wins": c["career_wins"], "career_losses": c["career_losses"],
            "price": coach_price, "srsBonus": coach_bonus,
            "coachOfYear": bool(coy_code) and c["code"] == coy_code,
        }

    dropped_unranked = 0
    for row in per_game_rows:
        franchise = resolve_franchise(row["tricode"])
        if franchise not in teams:
            # team exists in per_game but not in standings (shouldn't normally happen)
            continue
        adv = advanced_by_key.get((row["name"], row["tricode"]), {})
        player = {**row, **adv}
        del player["tricode"]
        if player.get("min") is None or player.get("gp") is None:
            dropped_unranked += 1
            continue
        teams[franchise]["players"].append(player)

    # rate every player against this season's own distribution (era-normalized) —
    # this is the fallback for anyone the real NBA 2K ratings below don't cover.
    all_players = [p for t in teams.values() for p in t["players"]]
    norms = season_norms(all_players)
    for p in all_players:
        p["rating"] = overall_rating(p, norms)
        p["price"] = price(p, norms)
        p["ratingSource"] = "model"

    # league leaders in a major stat category this season (real BBRef
    # per-season leaders, see parse_league_leaders) — checked by BBRef code
    # so it survives name punctuation/accents that string matching wouldn't.
    leader_codes = {stat: code for stat, code in leaders.items() if code}
    for p in all_players:
        p["ledStat"] = [stat.upper() for stat, code in leader_codes.items() if code == p.get("code")]

    # Overlay real NBA 2K ratings where HoopsHype has this team-season cached
    # (pipeline/fetch_2k.py) — a genuine 2K OVR replaces the computed one,
    # and price is re-derived from it so the budget economy stays consistent
    # whichever source a given player's rating came from.
    for tricode, t in teams.items():
        ratings_2k = load_2k_ratings(year, tricode)
        if not ratings_2k:
            continue
        for p in t["players"]:
            rating_2k = ratings_2k.get(normalize_name(p["name"]))
            if rating_2k is None:
                continue
            p["rating"] = rating_2k
            p["price"] = price_from_rating(rating_2k)
            p["ratingSource"] = "2k"

    return {
        "year": year,
        "label": f"{year - 1}-{str(year)[-2:]}",
        "champion": champion_code,
        "mvp": awards["mvp"],
        "roy": awards["roy"],
        "teams": teams,
    }


def main() -> None:
    if len(sys.argv) == 2:
        years = [int(sys.argv[1])]
    elif len(sys.argv) == 3:
        years = list(range(int(sys.argv[1]), int(sys.argv[2]) + 1))
    else:
        print(__doc__)
        sys.exit(1)

    OUT.mkdir(parents=True, exist_ok=True)
    coy_winners = load_coy_winners()
    for year in years:
        try:
            season = parse_season(year, coy_winners)
        except FileNotFoundError as e:
            print(f"skip {year}: {e}")
            continue
        n_teams = len(season["teams"])
        n_players = sum(len(t["players"]) for t in season["teams"].values())
        out_path = OUT / f"{year}.json"
        out_path.write_text(json.dumps(season), encoding="utf-8")
        print(f"{season['label']}: {n_teams} teams, {n_players} players -> {out_path.name}")


if __name__ == "__main__":
    main()
