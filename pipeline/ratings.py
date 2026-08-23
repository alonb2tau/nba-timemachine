"""
Turns raw per-game/advanced stats into the numbers the game actually uses:
a 0-99 overall rating and a draft-budget price. Same idea as Euroball's
priceOf()/prodScore(), but fed with NBA-native advanced stats (PER, BPM,
USG%) instead of EuroLeague's single PIR number.

WHY z-scores: "22 points per game" means something different in 2001 (lower
league-wide pace and efficiency) than in 2024. Z-scoring against that
season's own mean/stdev puts every era on the same scale before we compare
across 26 seasons of history.
"""
from __future__ import annotations

import statistics as stats

# Stats we z-score, and how much each contributes to "production" — the
# offensive-value half of a player's rating.
PRODUCTION_WEIGHTS = {
    "per": 0.40,   # Player Efficiency Rating — already a well-tested blend
    "pts": 0.20,
    "ast": 0.15,
    "ts_pct": 0.15,  # true shooting % — rewards efficient scoring, not just volume
    "bpm": 0.10,   # Box Plus/Minus — all-around value
}

# Defense is scored separately, per 36 minutes so role players get full
# credit even with limited minutes (mirrors Euroball's defScore design).
DEFENSE_WEIGHTS = {
    "drb_pct": 0.30,
    "stl": 0.35,
    "blk": 0.35,
}

CLAMP = 3.0  # cap z-scores so one absurd outlier season doesn't break pricing

# A guy who plays 8 minutes in one game and goes 1-for-1 can post a 31 PER —
# that's noise, not skill. Shrink the rating toward average when the sample
# (minutes x games) is small, the same idea Euroball uses for its defense
# rating. At 280 "minute-games" (e.g. 20 min x 14 games) reliability hits 1.0.
RELIABILITY_MINUTE_GAMES = 280.0


def season_norms(players: list[dict]) -> dict[str, tuple[float, float]]:
    """mean/stdev for every stat we'll z-score, computed once per season."""
    keys = set(PRODUCTION_WEIGHTS) | set(DEFENSE_WEIGHTS)
    norms = {}
    for k in keys:
        vals = [p[k] for p in players if p.get(k) is not None]
        if len(vals) < 2:
            norms[k] = (0.0, 1.0)
            continue
        norms[k] = (stats.mean(vals), stats.pstdev(vals) or 1.0)
    return norms


def _z(p: dict, key: str, norms: dict) -> float:
    if p.get(key) is None:
        return 0.0
    mean, sd = norms[key]
    return max(-CLAMP, min(CLAMP, (p[key] - mean) / sd))


def production_score(p: dict, norms: dict) -> float:
    return sum(w * _z(p, k, norms) for k, w in PRODUCTION_WEIGHTS.items())


def defense_score(p: dict, norms: dict) -> float:
    return sum(w * _z(p, k, norms) for k, w in DEFENSE_WEIGHTS.items())


def reliability(p: dict) -> float:
    minute_games = (p.get("min") or 0) * (p.get("gp") or 0)
    return min(1.0, minute_games / RELIABILITY_MINUTE_GAMES) ** 0.5


def _shrunk_production(p: dict, norms: dict) -> float:
    rel = reliability(p)
    return production_score(p, norms) * (0.3 + 0.7 * rel)


def overall_rating(p: dict, norms: dict) -> int:
    prod = _shrunk_production(p, norms)
    deff = defense_score(p, norms) * (0.3 + 0.7 * reliability(p))
    blended = 0.65 * prod + 0.35 * deff
    return max(20, min(99, round(56 + 13 * blended)))


def price(p: dict, norms: dict) -> float:
    """Draft-budget cost in the game's currency (Euroball calls it €M)."""
    prod = _shrunk_production(p, norms)
    base = 7 + 5.5 * prod
    if prod > 2:
        base += (prod - 2) * 9
    return max(1.0, min(35.0, round(base * 2) / 2))


def price_from_rating(rating: float) -> float:
    """
    Same price curve as price(), but starting from a 0-99 overall rating
    instead of a z-scored production number — the entry point used when a
    player's rating comes from a real NBA 2K score rather than the computed
    model. Inverts overall_rating()'s rating = 56 + 13*blended so a 2K
    rating costs what a stat-model player of the same rating would cost,
    keeping the two rating sources on one consistent budget economy.
    """
    blended = (rating - 56) / 13
    base = 7 + 5.5 * blended
    if blended > 2:
        base += (blended - 2) * 9
    return max(1.0, min(35.0, round(base * 2) / 2))


def coach_price_and_bonus(
    season_wins: int, season_losses: int,
    playoff_wins: int = 0, playoff_losses: int = 0,
    won_title: bool = False,
) -> tuple[float, float]:
    """
    Price ($1M-$10M) and team-strength bonus (SRS points) for a real head
    coach, from how their team actually did that season — regular season
    AND playoffs. A coach who went deep in the playoffs (a much smaller,
    tougher sample than 82 games) costs more and helps more than one who
    matched their regular-season record but got bounced early or missed
    the postseason entirely.
    """
    reg_games = season_wins + season_losses
    reg_pct = season_wins / reg_games if reg_games else 0.5

    po_games = playoff_wins + playoff_losses
    if po_games:
        po_pct = playoff_wins / po_games
        # regular season sets the baseline (larger, steadier sample);
        # playoff performance — a much higher bar — moves it further.
        combined = reg_pct * 0.6 + po_pct * 0.4
    else:
        combined = reg_pct

    norm = max(0.0, min(1.0, (combined - 0.25) / 0.50))  # .25-.75 -> 0-1
    coach_price = max(1.0, min(10.0, round(1 + 9 * norm)))
    srs_bonus = round((combined - 0.5) * 6, 1)  # can go negative for a bad season
    if won_title:
        srs_bonus = round(srs_bonus + 0.3, 1)
        coach_price = min(10.0, coach_price + 1)
    return coach_price, srs_bonus
