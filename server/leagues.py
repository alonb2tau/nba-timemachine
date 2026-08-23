"""
Quick League — head-to-head multiplayer. Up to 5 people join with a
shareable code/link, each drafts their own real squad, then every pair of
drafted squads plays one duel game. No accounts, no database: a league is
just an in-memory dict that lives as long as this server process does,
which is the right amount of persistence for something explicitly called
"quick" — same spirit as the rest of this backend (see app.py's docstring).

The game engine itself (quarters, halftime call, clutch shot) stays 100%
client-side and unchanged (sim.js) — this module is only a rendezvous
point: it tracks who's in the league, holds each player's finished roster
so a duel's *arbiter* (whichever of the two players opens and plays that
matchup first) can run the sim locally against a real opponent roster, and
stores the final result so the other player can see how it went.
"""
from __future__ import annotations

import json
import os
import secrets
import time
from itertools import combinations
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/leagues")

MAX_PLAYERS = 5
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I — easy to read aloud

_SAVE_PATH = Path(os.environ.get("LEAGUES_FILE", "data/leagues.json"))


def _load() -> dict[str, dict]:
    try:
        return json.loads(_SAVE_PATH.read_text())
    except Exception:
        return {}


def _save() -> None:
    try:
        _SAVE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SAVE_PATH.write_text(json.dumps(LEAGUES))
    except Exception:
        pass


LEAGUES: dict[str, dict] = _load()


def _new_code() -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(5))
        if code not in LEAGUES:
            return code


def _new_id() -> str:
    return secrets.token_hex(8)


def _get_league(code: str) -> dict:
    league = LEAGUES.get(code.upper())
    if not league:
        raise HTTPException(404, f"no league with code {code}")
    return league


def _get_player(league: dict, player_id: str) -> dict:
    for p in league["players"]:
        if p["id"] == player_id:
            return p
    raise HTTPException(404, "not a player in this league")


def _get_duel(league: dict, duel_id: str) -> dict:
    for d in league["duels"]:
        if d["id"] == duel_id:
            return d
    raise HTTPException(404, "no such duel")


def _sync_duels(league: dict) -> None:
    """Create any missing pairwise duels among players who are ready to
    play — called every time a roster comes in, so duels appear as soon as
    a second (third, fourth...) player finishes drafting, not only once
    everyone has."""
    ready = [p for p in league["players"] if p["ready"]]
    existing = {frozenset((d["aId"], d["bId"])) for d in league["duels"]}
    for a, b in combinations(ready, 2):
        key = frozenset((a["id"], b["id"]))
        if key in existing:
            continue
        league["duels"].append({
            "id": _new_id(), "aId": a["id"], "bId": b["id"],
            "status": "pending", "arbiterId": None, "result": None,
        })
    if league["duels"]:
        league["status"] = "dueling"
    if league["duels"] and all(d["status"] == "done" for d in league["duels"]):
        league["status"] = "done"


def _standings(league: dict) -> list[dict]:
    wins = {p["id"]: 0 for p in league["players"]}
    losses = {p["id"]: 0 for p in league["players"]}
    for d in league["duels"]:
        r = d["result"]
        if not r:
            continue
        wins[r["winnerId"]] = wins.get(r["winnerId"], 0) + 1
        loser_id = d["bId"] if r["winnerId"] == d["aId"] else d["aId"]
        losses[loser_id] = losses.get(loser_id, 0) + 1
    return [{"playerId": p["id"], "wins": wins.get(p["id"], 0), "losses": losses.get(p["id"], 0)}
            for p in league["players"]]


def _public_player(p: dict) -> dict:
    return {"id": p["id"], "name": p["name"], "franchiseCode": p["franchiseCode"],
            "franchiseName": p["franchiseName"], "ready": p["ready"]}


def _public_duel(league: dict, d: dict) -> dict:
    a, b = _get_player(league, d["aId"]), _get_player(league, d["bId"])
    return {
        "id": d["id"], "status": d["status"], "arbiterId": d["arbiterId"],
        "a": {"id": a["id"], "name": a["name"], "franchiseName": a["franchiseName"]},
        "b": {"id": b["id"], "name": b["name"], "franchiseName": b["franchiseName"]},
        "result": ({"aScore": d["result"]["aScore"], "bScore": d["result"]["bScore"],
                     "winnerId": d["result"]["winnerId"]} if d["result"] else None),
    }


def _public_league(league: dict) -> dict:
    return {
        "code": league["code"], "status": league["status"], "maxPlayers": MAX_PLAYERS,
        "players": [_public_player(p) for p in league["players"]],
        "duels": [_public_duel(league, d) for d in league["duels"]],
        "standings": _standings(league),
    }


class CreateBody(BaseModel):
    name: str


class JoinBody(BaseModel):
    name: str


class FranchiseBody(BaseModel):
    code: str
    name: str
    realName: str | None = None
    colors: list[str] | None = None
    nba_id: int | None = None


class RosterBody(BaseModel):
    starters: list[dict]
    bench: list[dict]
    coach: dict | None = None
    budget: float


class ClaimBody(BaseModel):
    playerId: str


class ResultBody(BaseModel):
    playerId: str
    aScore: int
    bScore: int
    aBox: list[dict]
    bBox: list[dict]
    quarterLog: list[dict]


@router.post("")
def create_league(body: CreateBody):
    name = body.name.strip()[:40] or "Host"
    code = _new_code()
    player = {"id": _new_id(), "name": name, "franchiseCode": None, "franchiseName": None,
              "roster": None, "ready": False}
    league = {"code": code, "createdAt": time.time(), "status": "lobby",
              "players": [player], "duels": []}
    LEAGUES[code] = league
    _save()
    return {"code": code, "playerId": player["id"], "league": _public_league(league)}


@router.get("/{code}")
def get_league(code: str):
    return _public_league(_get_league(code))


@router.post("/{code}/join")
def join_league(code: str, body: JoinBody):
    league = _get_league(code)
    if league["status"] != "lobby":
        raise HTTPException(400, "this league has already started drafting")
    if len(league["players"]) >= MAX_PLAYERS:
        raise HTTPException(400, "this league is full")
    name = body.name.strip()[:40] or f"Player {len(league['players']) + 1}"
    player = {"id": _new_id(), "name": name, "franchiseCode": None, "franchiseName": None,
              "roster": None, "ready": False}
    league["players"].append(player)
    _save()
    return {"playerId": player["id"], "league": _public_league(league)}


@router.post("/{code}/players/{player_id}/franchise")
def set_franchise(code: str, player_id: str, body: FranchiseBody):
    league = _get_league(code)
    player = _get_player(league, player_id)
    taken = {p["franchiseCode"] for p in league["players"] if p["id"] != player_id and p["franchiseCode"]}
    if body.code in taken:
        raise HTTPException(409, "another player in this league already picked that franchise")
    player["franchiseCode"] = body.code
    player["franchiseName"] = body.name
    player["franchiseRealName"] = body.realName
    player["franchiseColors"] = body.colors
    player["franchiseNbaId"] = body.nba_id
    _save()
    return _public_league(league)


@router.post("/{code}/players/{player_id}/roster")
def submit_roster(code: str, player_id: str, body: RosterBody):
    league = _get_league(code)
    player = _get_player(league, player_id)
    if not player["franchiseCode"]:
        raise HTTPException(400, "pick a franchise before submitting a roster")
    player["roster"] = body.model_dump()
    player["ready"] = True
    _sync_duels(league)
    _save()
    return _public_league(league)


@router.get("/{code}/duels/{duel_id}")
def get_duel(code: str, duel_id: str):
    league = _get_league(code)
    d = _get_duel(league, duel_id)
    a, b = _get_player(league, d["aId"]), _get_player(league, d["bId"])
    out = _public_duel(league, d)
    out["a"]["roster"] = a["roster"]
    out["a"]["franchiseColors"] = a.get("franchiseColors")
    out["a"]["franchiseNbaId"] = a.get("franchiseNbaId")
    out["b"]["roster"] = b["roster"]
    out["b"]["franchiseColors"] = b.get("franchiseColors")
    out["b"]["franchiseNbaId"] = b.get("franchiseNbaId")
    if d["result"]:
        out["result"]["aBox"] = d["result"]["aBox"]
        out["result"]["bBox"] = d["result"]["bBox"]
        out["result"]["quarterLog"] = d["result"]["quarterLog"]
    return out


@router.post("/{code}/duels/{duel_id}/claim")
def claim_duel(code: str, duel_id: str, body: ClaimBody):
    league = _get_league(code)
    d = _get_duel(league, duel_id)
    if body.playerId not in (d["aId"], d["bId"]):
        raise HTTPException(403, "you're not part of this duel")
    if d["status"] not in ("pending", "live"):
        raise HTTPException(400, "this duel is already decided")
    d["status"] = "live"
    d["arbiterId"] = body.playerId
    _save()
    return get_duel(code, duel_id)


@router.post("/{code}/duels/{duel_id}/result")
def submit_result(code: str, duel_id: str, body: ResultBody):
    league = _get_league(code)
    d = _get_duel(league, duel_id)
    if body.playerId != d["arbiterId"]:
        raise HTTPException(403, "only the player who's playing this duel can submit its result")
    winner_id = d["aId"] if body.aScore >= body.bScore else d["bId"]
    d["result"] = {"aScore": body.aScore, "bScore": body.bScore, "winnerId": winner_id,
                    "aBox": body.aBox, "bBox": body.bBox, "quarterLog": body.quarterLog}
    d["status"] = "done"
    _sync_duels(league)
    _save()
    return _public_league(league)
