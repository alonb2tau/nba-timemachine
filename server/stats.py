"""
Lightweight, anonymous gameplay telemetry — no accounts, no PII. Each
browser gets a random session id (web/js/stats.js) and the frontend pings
a handful of checkpoints (difficulty picked, franchise picked, draft
done, season started/checkpoint/finished) so the /admin dashboard can
answer real questions about how people actually play: which difficulty,
how far into the season, what they finish with on average.

Storage is Supabase (hosted Postgres) rather than local disk because
Render's free-tier filesystem is wiped on every deploy/restart — a local
SQLite file would silently lose everything the next time this redeploys.
Every function here degrades to a no-op / empty result if
SUPABASE_URL / SUPABASE_SERVICE_KEY aren't set, so local dev without
those env vars still runs fine.
"""
import logging
import os

import httpx

log = logging.getLogger("uvicorn.error")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_STATS_PASSWORD", "")

ENABLED = bool(SUPABASE_URL and SUPABASE_KEY)

_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


async def upsert_run(run_id: str, patch: dict) -> None:
    """One row per *game*, not per browser — merge-duplicates on run_id
    means every checkpoint within the same playthrough updates the same
    row, but starting a new game (a fresh run_id, minted client-side in
    web/js/stats.js's startNewRun()) always gets its own row, even from
    the same browser tab that already has one."""
    if not ENABLED:
        return
    payload = {"run_id": run_id, **patch}
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/runs",
            headers={**_HEADERS, "Prefer": "resolution=merge-duplicates"},
            json=payload,
        )
        if resp.status_code >= 400:
            log.warning("stats upsert failed (%s): %s", resp.status_code, resp.text[:500])


async def fetch_all_runs() -> list[dict]:
    if not ENABLED:
        return []
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/runs",
            headers=_HEADERS,
            params={"select": "*", "limit": "5000"},
        )
        resp.raise_for_status()
        return resp.json()


def _avg(vals):
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def summarize_runs(runs: list[dict]) -> dict:
    """Everything the dashboard needs, computed in Python rather than via
    PostgREST's aggregate query syntax — this data is small (a personal
    project's telemetry, not real traffic), so pulling every row and
    summarizing here is simpler than wiring up SQL views for it."""
    total = len(runs)
    by_diff: dict[str, list[dict]] = {}
    for r in runs:
        by_diff.setdefault(r.get("difficulty") or "unknown", []).append(r)

    difficulty_breakdown = []
    for diff, rows in sorted(by_diff.items()):
        completed = [r for r in rows if r.get("season_complete")]
        difficulty_breakdown.append({
            "difficulty": diff,
            "runs": len(rows),
            "completion_rate": round(len(completed) / len(rows) * 100, 1) if rows else 0,
            "avg_final_seed": _avg([r.get("final_seed") for r in completed]),
            "champion_rate": (
                round(sum(1 for r in completed if r.get("playoff_result") == "champion") / len(completed) * 100, 1)
                if completed else None
            ),
        })

    franchise_counts: dict[str, int] = {}
    for r in runs:
        name = r.get("franchise_name")
        if name:
            franchise_counts[name] = franchise_counts.get(name, 0) + 1
    top_franchises = sorted(franchise_counts.items(), key=lambda kv: -kv[1])[:10]

    playoff_counts: dict[str, int] = {}
    for r in runs:
        res = r.get("playoff_result")
        if res:
            playoff_counts[res] = playoff_counts.get(res, 0) + 1

    completed_all = [r for r in runs if r.get("season_complete")]
    in_progress = [r for r in runs if r.get("season_started") and not r.get("season_complete")]

    unique_sessions = len({r["session_id"] for r in runs if r.get("session_id")})

    day_counts: dict[str, int] = {}
    for r in runs:
        created = r.get("created_at")
        if created:
            day_counts[created[:10]] = day_counts.get(created[:10], 0) + 1
    runs_by_day = [{"date": d, "count": c} for d, c in sorted(day_counts.items())]

    return {
        "total_runs": total,
        "unique_sessions": unique_sessions,
        "difficulty_chosen": sum(1 for r in runs if r.get("difficulty")),
        "draft_completed": sum(1 for r in runs if r.get("draft_completed")),
        "season_started": sum(1 for r in runs if r.get("season_started")),
        "season_completed": len(completed_all),
        "overall_completion_rate": round(len(completed_all) / total * 100, 1) if total else 0,
        "avg_games_played_in_progress": _avg([r.get("games_played") for r in in_progress]),
        "by_difficulty": difficulty_breakdown,
        "top_franchises": [{"name": n, "count": c} for n, c in top_franchises],
        "playoff_result_breakdown": [
            {"result": k, "count": v} for k, v in sorted(playoff_counts.items(), key=lambda kv: -kv[1])
        ],
        "runs_by_day": runs_by_day,
    }


# ------------------------------------------------------------- leaderboard --

# How far a run got, worst to best. Ranking is strictly tiered: reaching a
# higher tier always outranks every run in a lower tier, no matter the
# regular-season record — a 45-37 champion outranks a 79-3 team that lost
# in round 1. Regular-season wins only break ties *within* the same tier.
TIER_LABELS = [
    "Missed the Playoffs",   # 0
    "Lost in the Play-In",   # 1
    "Lost in Round 1",       # 2
    "Lost in the Conference Semifinals",  # 3
    "Lost in the Conference Finals",      # 4
    "Lost in the NBA Finals",             # 5
    "NBA Champion",          # 6
]


def _tier_of(playoff_result: str | None) -> int:
    if not playoff_result or playoff_result == "missed_playin":
        return 0
    if playoff_result == "champion":
        return 6
    if "NBA Finals" in playoff_result:
        return 5
    if "Conference Finals" in playoff_result:
        return 4
    if "Semifinals" in playoff_result:
        return 3
    if "Round 1" in playoff_result:
        return 2
    if "Play-In" in playoff_result:
        return 1
    return 0


def _iso_week(created_at: str):
    from datetime import datetime
    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    year, week, _ = dt.isocalendar()
    return (year, week)


def leaderboard_for(runs: list[dict], difficulty: str, run_id: str | None = None) -> dict:
    """This week's ranking for one difficulty. Tiered strictly by playoff
    depth reached (see _tier_of); wins/losses only break ties inside a
    tier — so the displayed score is deliberately spaced (tier * 1000) so
    no regular-season record can ever bleed a run into the tier above it."""
    from datetime import datetime, timezone
    this_week = _iso_week(datetime.now(timezone.utc).isoformat())

    entries = []
    for r in runs:
        if not r.get("season_complete"):
            continue
        if (r.get("difficulty") or "unknown") != difficulty:
            continue
        created = r.get("created_at")
        if not created or _iso_week(created) != this_week:
            continue
        wins = r.get("wins") or 0
        losses = r.get("losses") or 0
        tier = _tier_of(r.get("playoff_result"))
        entries.append({
            "run_id": r.get("run_id"),
            "team_name": r.get("franchise_name") or "Unnamed Team",
            "wins": wins,
            "losses": losses,
            "tier": tier,
            "result_label": TIER_LABELS[tier],
            "score": tier * 1000 + 300 + wins * 3 - losses,
        })

    entries.sort(key=lambda e: -e["score"])
    for i, e in enumerate(entries):
        e["rank"] = i + 1

    your_entry = next((e for e in entries if run_id and e["run_id"] == run_id), None)

    return {
        "difficulty": difficulty,
        "week": f"{this_week[0]}-W{this_week[1]:02d}",
        "total_entries": len(entries),
        "top": entries[:20],
        "your_rank": your_entry["rank"] if your_entry else None,
        "your_entry": your_entry,
    }
