/*
 * chemistry.js — real history matters. Two players who were actual
 * teammates on some historical squad play better together here than two
 * strangers with the same stat lines; a coach who really coached a player
 * gets more out of him too. All of it built from data we already have —
 * every season is preloaded in SEASONS_CACHE before the draft starts, so
 * this is one pass over data already in memory, not a new fetch.
 */

let PLAYER_HISTORY = null; // code -> [{franchise, year, label, teamName}]
let COACH_HISTORY = null;  // code -> [{franchise, year, label, teamName}]

function buildHistoryIndexes() {
  PLAYER_HISTORY = {};
  COACH_HISTORY = {};
  for (const s of seasons) {
    const season = SEASONS_CACHE.get(s.year);
    for (const [franchise, team] of Object.entries(season.teams)) {
      for (const p of team.players) {
        if (!p.code) continue;
        (PLAYER_HISTORY[p.code] ||= []).push({ franchise, year: s.year, label: season.label, teamName: team.name });
      }
      if (team.coach && team.coach.code) {
        (COACH_HISTORY[team.coach.code] ||= []).push({ franchise, year: s.year, label: season.label, teamName: team.name });
      }
    }
  }
}

function sharedStint(historyA, historyB) {
  for (const a of historyA) for (const b of historyB) {
    if (a.franchise === b.franchise && a.year === b.year) return a;
  }
  return null;
}

/** Every real historical connection among the current roster + coach. */
function chemistryLinks(starters, bench, coach) {
  if (!PLAYER_HISTORY) return [];
  const roster = starters.concat(bench).filter(s => s.player).map(s => s.player);
  const links = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const a = roster[i], b = roster[j];
      const shared = sharedStint(PLAYER_HISTORY[a.code] || [], PLAYER_HISTORY[b.code] || []);
      if (shared) links.push({ kind: "players", a: a.name, b: b.name, teamName: shared.teamName, label: shared.label });
    }
  }
  if (coach && coach.code) {
    const coachHist = COACH_HISTORY[coach.code] || [];
    for (const p of roster) {
      const shared = sharedStint(PLAYER_HISTORY[p.code] || [], coachHist);
      if (shared) links.push({ kind: "coach", a: coach.name, b: p.name, teamName: shared.teamName, label: shared.label });
    }
  }
  return links;
}

const CHEMISTRY_PER_LINK = 0.2; // SRS points per real historical connection
const CHEMISTRY_CAP = 3.0;

function chemistryBonus(starters, bench, coach) {
  const links = chemistryLinks(starters, bench, coach);
  const bonus = Math.min(CHEMISTRY_CAP, links.length * CHEMISTRY_PER_LINK);
  return { bonus, links };
}
