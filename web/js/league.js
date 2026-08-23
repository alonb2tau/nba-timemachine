/*
 * league.js — the rest of the NBA that isn't you: the other 29 real
 * franchises (whichever one you didn't pick in franchise.js), each a fixed
 * historical (season) snapshot drawn once for this run, real conference/
 * division structure from the scraped data, and a schedule built the way
 * an actual NBA slate is weighted (division rivals more often than a team
 * you never see).
 *
 * A deliberate simplification, and a defensible one: instead of literally
 * simulating all 29 other teams' games against each other (a lot of
 * machinery for no player-facing benefit), each AI team's record at any
 * point in the season is a pure function of their REAL historical win
 * percentage and how many games have elapsed. It's not a live simulation,
 * but it's not fake either — Games 30-31 of the 2009-10 Lakers really did
 * go about 70% their way, and that's what this reflects. Only your own
 * games are actually simulated, one at a time, by sim.js.
 */

function allFranchiseCodes() {
  const latestYear = Math.max(...seasons.map(s => s.year));
  return Object.keys(SEASONS_CACHE.get(latestYear).teams);
}

/** The other 29 franchises — everyone except the one you're playing as. */
function drawAiLeague() {
  const codes = allFranchiseCodes().filter(c => c !== FRANCHISE.code);
  const league = {};
  for (const code of codes) {
    const validYears = seasons.filter(s => SEASONS_CACHE.get(s.year).teams[code]);
    const s = rand(validYears);
    const team = SEASONS_CACHE.get(s.year).teams[code];
    const games = team.wins + team.losses;
    league[code] = {
      code, name: team.name, colors: team.colors, nba_id: team.nba_id,
      conf: team.conf, div: team.div, srs: team.srs,
      winPct: games ? team.wins / games : 0.5,
      year: s.year, label: s.label,
    };
  }
  return league;
}

function aiRecordAt(team, gamesElapsed) {
  const g = Math.max(0, Math.min(82, gamesElapsed));
  const w = Math.round(team.winPct * g);
  return { wins: w, losses: g - w };
}

function buildUserSchedule(aiLeague, yourConf, yourDiv) {
  const all = Object.values(aiLeague);
  const divRivals = all.filter(t => t.conf === yourConf && t.div === yourDiv);
  const confMates = all.filter(t => t.conf === yourConf && t.div !== yourDiv);
  const otherConf = all.filter(t => t.conf !== yourConf);

  const pool = [];
  for (const t of divRivals) for (let i = 0; i < 4; i++) pool.push(t);
  for (const t of confMates) for (let i = 0; i < 3; i++) pool.push(t);
  for (const t of otherConf) for (let i = 0; i < 2; i++) pool.push(t);

  while (pool.length > 82) pool.splice(Math.floor(Math.random() * pool.length), 1);
  const fillPool = divRivals.concat(confMates, otherConf);
  while (pool.length < 82) pool.push(rand(fillPool));

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/** Standings for one conference at a point in the season, sorted best-first. "you" is {conf, wins, losses, srs} or null. */
function conferenceStandings(aiLeague, conf, gamesElapsed, you) {
  const rows = Object.values(aiLeague).filter(t => t.conf === conf).map(t => {
    const r = aiRecordAt(t, gamesElapsed);
    return { code: t.code, name: t.name, colors: t.colors, nba_id: t.nba_id, srs: t.srs, wins: r.wins, losses: r.losses, isYou: false };
  });
  if (you && you.conf === conf) {
    rows.push({ code: FRANCHISE.code, name: FRANCHISE.name, colors: FRANCHISE.colors, nba_id: FRANCHISE.nba_id, srs: you.srs, wins: you.wins, losses: you.losses, isYou: true });
  }
  rows.sort((a, b) => (b.wins / Math.max(1, b.wins + b.losses)) - (a.wins / Math.max(1, a.wins + a.losses)));
  return rows;
}
