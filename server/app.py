"""
The whole backend, on purpose kept tiny: serve the static frontend, and hand
it season JSON on request. All game logic (draft, budget, rendering) lives
in the browser in web/js/ — the server's only job is being a librarian for
the data pipeline's output.

Run with:
    uvicorn server.app:app --reload --port 8000
(run from the project root so the relative paths below resolve)
"""
import json
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from server import stats

ROOT = Path(__file__).resolve().parent.parent
SEASONS_DIR = ROOT / "data" / "seasons"
WEB_DIR = ROOT / "web"

app = FastAPI(title="NBA Time Machine")


@app.middleware("http")
async def no_cache_static(request, call_next):
    """No build step means no hashed filenames — without this, a browser
    that already loaded js/*.js or css/*.css can keep serving those exact
    bytes indefinitely after a deploy ships new ones. ETag/Last-Modified
    still make repeat loads cheap; this just forces the revalidation check
    every time instead of skipping it."""
    response = await call_next(request)
    if request.url.path.startswith(("/js/", "/css/")):
        response.headers["Cache-Control"] = "no-cache"
    return response


# Real players/coaches only from the 2010-11 season on — the first season
# with reliable NBA 2K ratings coverage (pipeline/fetch_2k.py). Older
# seasons stay on disk in data/seasons/ (harmless) but aren't served.
SEASON_MIN_YEAR = 2011


@app.get("/api/seasons")
def list_seasons():
    """Every season we have data for, sorted oldest to newest."""
    years = sorted(int(p.stem) for p in SEASONS_DIR.glob("*.json") if int(p.stem) >= SEASON_MIN_YEAR)
    out = []
    for y in years:
        data = json.loads((SEASONS_DIR / f"{y}.json").read_text())
        out.append({"year": y, "label": data["label"]})
    return out


@app.get("/api/seasons/{year}")
def get_season(year: int):
    path = SEASONS_DIR / f"{year}.json"
    if year < SEASON_MIN_YEAR or not path.exists():
        raise HTTPException(404, f"no data for season {year}")
    return FileResponse(path, media_type="application/json")


KNOWN_EVENTS = {
    "difficulty_chosen", "franchise_picked", "draft_completed",
    "season_started", "season_checkpoint", "season_finished",
}


class StatEvent(BaseModel):
    run_id: str
    session_id: str
    event: str
    difficulty: str | None = None
    budget: float | None = None
    franchise_code: str | None = None
    franchise_name: str | None = None
    games_played: int | None = None
    wins: int | None = None
    losses: int | None = None
    conference: str | None = None
    final_seed: int | None = None
    made_playoffs: bool | None = None
    playoff_result: str | None = None


# checkpoint-only flags each event flips on, beyond whatever fields the
# frontend already sent in the same request
EVENT_FLAGS = {
    "draft_completed": {"draft_completed": True},
    "season_started": {"season_started": True},
    "season_finished": {"season_complete": True},
}


EVENT_RATE_LIMIT = 30  # events
EVENT_RATE_WINDOW = 60  # seconds — generous for genuine play, tight for a script
_recent_events: dict[str, deque] = defaultdict(deque)


def _rate_limited(client_ip: str) -> bool:
    now = time.time()
    hits = _recent_events[client_ip]
    while hits and now - hits[0] > EVENT_RATE_WINDOW:
        hits.popleft()
    if len(hits) >= EVENT_RATE_LIMIT:
        return True
    hits.append(now)
    return False


@app.post("/api/stats/event")
async def post_stat_event(body: StatEvent, request: Request):
    if not stats.ENABLED:
        return {"ok": False, "reason": "stats not configured"}
    if body.event not in KNOWN_EVENTS:
        raise HTTPException(400, "unknown event")
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limited(client_ip):
        raise HTTPException(429, "too many events")
    patch = body.model_dump(exclude={"run_id", "event"}, exclude_none=True)
    patch.update(EVENT_FLAGS.get(body.event, {}))
    await stats.upsert_run(body.run_id, patch)
    return {"ok": True}


@app.get("/api/leaderboard")
async def leaderboard(difficulty: str, run_id: str | None = None):
    if not stats.ENABLED:
        return {"enabled": False}
    runs = await stats.fetch_all_runs()
    data = stats.leaderboard_for(runs, difficulty, run_id)
    data["enabled"] = True
    return data


@app.get("/api/stats/summary")
async def stats_summary(x_admin_password: str | None = Header(default=None)):
    if not stats.ADMIN_PASSWORD or x_admin_password != stats.ADMIN_PASSWORD:
        raise HTTPException(401, "bad admin password")
    runs = await stats.fetch_all_runs()
    return stats.summarize_runs(runs)


# static frontend last, so it doesn't swallow the /api routes above
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
