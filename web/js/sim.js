/*
 * sim.js — turns a roster + tactics + an opponent's real SRS into a played
 * game: four quarter scores, a final, and a box score built from each
 * player's actual historical per-game stats (scaled to what happened in
 * this simulated game, not fabricated independently of it).
 *
 * No DOM access here on purpose — this file is pure data-in, data-out, so
 * it can be tested and read on its own.
 */

function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const TACTIC_DEFS = {
  pace: {
    slow:     { totalMult: 0.92, label: "Slow it down" },
    balanced: { totalMult: 1.00, label: "Balanced" },
    fast:     { totalMult: 1.09, label: "Push the pace" },
  },
  // Every tactic below carries a flat srsDelta rather than a multiplier on
  // top of team SRS — with a properly-calibrated baseline (see
  // ratingToSRS) that baseline sits close to zero for a middling roster,
  // and a *multiplier* on a number near zero barely moves it at all. A
  // flat delta stays meaningful regardless of how strong or weak the
  // roster underneath it is, so tactical choices matter for every team,
  // not just already-elite ones.
  shots: {
    paint:    { srsDelta: 0.6,  varianceMult: 0.90, label: "Attack the paint" },
    balanced: { srsDelta: 0.0,  varianceMult: 1.00, label: "Balanced" },
    three:    { srsDelta: -0.3, varianceMult: 1.25, label: "Fire from three" },
  },
  scheme: {
    man:      { srsDelta: 1.1,  label: "Lockdown man" },
    solid:    { srsDelta: 0.0,  label: "Solid" },
    switch:   { srsDelta: -0.8, label: "Switch everything" },
  },
  // ball movement: a motion offense is a little more efficient (the shot
  // it generates is a better one) at the cost of leaning on system over
  // star shot-creation; isolation-heavy leans the other way.
  offense: {
    iso:      { srsDelta: 0.2, label: "Isolation-heavy" },
    balanced: { srsDelta: 0.0, label: "Balanced" },
    motion:   { srsDelta: 0.4, label: "Motion offense" },
  },
  // rebounding emphasis: crashing the boards trades a bit of transition
  // defense (opponent gets easier looks the other way) for second chances.
  boards: {
    crash:    { srsDelta: 0.3,  label: "Crash the glass" },
    balanced: { srsDelta: 0.0,  label: "Balanced" },
    getback:  { srsDelta: -0.2, label: "Get back on defense" },
  },
  // bench usage: how much of the team's identity is the starting five vs.
  // the bench, this game — the same split squadRating()/squadStatLine()
  // use to blend a "team" number out of two units.
  rotation: {
    starters: { starters: 0.85, bench: 0.15, label: "Ride the starters" },
    balanced: { starters: 0.75, bench: 0.25, label: "Balanced rotation" },
    deep:     { starters: 0.65, bench: 0.35, label: "Go deep on the bench" },
  },
};

// Default starters/bench split (the "Balanced rotation" tactic) — used
// whenever a caller doesn't have a rotation tactic to hand (the draft
// screen, before the Team Hub's Game Plan even exists).
const STARTERS_WEIGHT = TACTIC_DEFS.rotation.balanced.starters;
const BENCH_WEIGHT = TACTIC_DEFS.rotation.balanced.bench;

function rotationWeights(rotationKey) {
  return TACTIC_DEFS.rotation[rotationKey] || TACTIC_DEFS.rotation.balanced;
}

/** Average OVR of a slot array (starters weighted more than bench). */
function squadRating(starters, bench, rotationKey) {
  const w = rotationWeights(rotationKey);
  const avg = arr => arr.reduce((s, x) => s + (x.player ? x.player.rating : 50), 0) / arr.length;
  return avg(starters) * w.starters + avg(bench) * w.bench;
}

/**
 * A team-wide per-game stat line, blended the same way as the overall
 * rating: mostly what the starting five puts up, with the bench's own
 * averages carrying less weight — not a literal points total (that
 * depends on minutes played, which this game doesn't model), but a single
 * "how good is this roster, stat by stat" snapshot for the post-draft and
 * team-hub screens.
 */
function squadStatLine(starters, bench, rotationKey) {
  const w = rotationWeights(rotationKey);
  const startersP = starters.filter(s => s.player).map(s => s.player);
  const benchP = bench.filter(s => s.player).map(s => s.player);
  const avg = (arr, key) => arr.length ? arr.reduce((s, p) => s + (p[key] || 0), 0) / arr.length : 0;
  const blend = key => avg(startersP, key) * w.starters + avg(benchP, key) * w.bench;
  return {
    pts: blend("pts"), reb: blend("reb"), ast: blend("ast"),
    stl: blend("stl"), blk: blend("blk"), tov: blend("tov"),
    fg2_pct: blend("fg2_pct"), fg3_pct: blend("fg3_pct"), ft_pct: blend("ft_pct"),
    age: blend("age"),
  };
}

/**
 * Convert our 20-99 OVR scale to the same SRS scale real teams are rated
 * on. The pivot (67) is calibrated to a Medium-difficulty (€100M) roster's
 * typical average OVR, measured directly — not guessed — so a middling
 * roster on the standard difficulty lands at roughly a real opponent's
 * average SRS (the actual league's real-team SRS averages ~0 by
 * definition). That's deliberate: at this pivot, whether you're actually
 * favored or an underdog is decided by the things you control on top of
 * raw roster spend — chemistry, accolades, coach, tactics, trivia — not
 * baked in by the difficulty pick alone.
 */
function ratingToSRS(avgOvr) {
  return (avgOvr - 67) * 0.5;
}

/**
 * Coaching staff you can hire in the Team Hub, priced $1M-$10M out of the
 * same $100M cap as your 10 players. Price buys a direct SRS bonus — the
 * same scale real teams are rated on — so a marquee coach is a genuine
 * alternative to one more roster upgrade, not a cosmetic pick.
 */
const COACHES = [
  { id: "c1",  name: "Todd Reiner",     style: "Undrafted assistant",       price: 1,  srsBonus: 0.2 },
  { id: "c2",  name: "Marcus Webb",     style: "Rookie coordinator",        price: 2,  srsBonus: 0.5 },
  { id: "c3",  name: "Elena Cruz",      style: "Systems coach",             price: 3,  srsBonus: 0.8 },
  { id: "c4",  name: "DeShawn Carter",  style: "Player's coach",            price: 4,  srsBonus: 1.1 },
  { id: "c5",  name: "Bill Harmon",     style: "Proven tactician",          price: 5,  srsBonus: 1.4 },
  { id: "c6",  name: "Nate Okafor",     style: "Defensive guru",            price: 6,  srsBonus: 1.7 },
  { id: "c7",  name: "Ray Solano",      style: "Offensive mastermind",      price: 7,  srsBonus: 2.0 },
  { id: "c8",  name: "Frank Dellucci",  style: "Championship pedigree",     price: 8,  srsBonus: 2.3 },
  { id: "c9",  name: "Ken Ishida",      style: "Executive of the Year",     price: 9,  srsBonus: 2.6 },
  { id: "c10", name: "Gregory Vann",    style: "Hall of Fame bench boss",   price: 10, srsBonus: 3.0 },
];

function teamStrength(starters, bench, tactics, coach, bonusSrs) {
  const avgOvr = squadRating(starters, bench, tactics.rotation);
  let srs = ratingToSRS(avgOvr);
  srs += TACTIC_DEFS.shots[tactics.shots].srsDelta;
  srs += TACTIC_DEFS.scheme[tactics.scheme].srsDelta;
  if (tactics.offense) srs += TACTIC_DEFS.offense[tactics.offense].srsDelta;
  if (tactics.boards) srs += TACTIC_DEFS.boards[tactics.boards].srsDelta;
  if (coach) srs += coach.srsBonus;
  if (typeof chemistryBonus === "function") srs += chemistryBonus(starters, bench, coach).bonus;
  if (typeof accoladesBonus === "function") srs += accoladesBonus(starters, bench, coach, tactics.rotation).bonus;
  if (bonusSrs) srs += bonusSrs; // the trivia round's reward, if any
  return srs;
}

/**
 * Simulate one quarter. `diffBias` lets a halftime adjustment nudge the
 * second-half margin without re-rolling everything from scratch.
 */
function simQuarter(youSRS, oppSRS, tactics, homeAdv, diffBias) {
  const paceMult = TACTIC_DEFS.pace[tactics.pace].totalMult;
  const varMult = TACTIC_DEFS.shots[tactics.shots].varianceMult;
  const baseTotal = 52 * paceMult; // ~ combined points for one quarter at balanced pace
  const diff = (youSRS - oppSRS + homeAdv + diffBias) / 4 + gauss() * 3.2 * varMult;
  const total = baseTotal + gauss() * 4.5;
  let you = Math.round((total + diff) / 2);
  let opp = Math.round((total - diff) / 2);
  you = Math.max(14, you);
  opp = Math.max(14, opp);
  return [you, opp];
}

/**
 * Build a box score for one team from its roster + how many total points
 * that team actually scored in the simulated game. Each player's points
 * start from their real career-average PPG (with per-game noise), then
 * everyone is scaled so the box score adds up to the real final score —
 * the stats are a *consequence* of the sim result, not decoration on top
 * of it.
 */
function genBoxScore(starters, bench, teamScore, won) {
  const active = starters.concat(bench).filter(s => s.player);
  const lines = active.map(s => {
    const p = s.player;
    const noise = 0.75 + Math.random() * 0.5; // 0.75x - 1.25x a typical night
    const formBonus = won ? 1.04 : 0.97;
    const expPts = Math.max(0, p.pts * noise * formBonus);
    return {
      name: p.name, pos: s.pos, starter: starters.includes(s),
      expPts,
      reb: Math.max(0, p.reb * noise),
      ast: Math.max(0, p.ast * noise),
      stl: Math.max(0, (p.stl || 0) * noise),
      blk: Math.max(0, (p.blk || 0) * noise),
    };
  });
  const expTotal = lines.reduce((s, l) => s + l.expPts, 0) || 1;
  const scale = teamScore / expTotal;
  return lines.map(l => ({
    name: l.name, pos: l.pos, starter: l.starter,
    pts: Math.round(l.expPts * scale),
    reb: Math.round(l.reb * 10) / 10,
    ast: Math.round(l.ast * 10) / 10,
    stl: Math.round(l.stl * 10) / 10,
    blk: Math.round(l.blk * 10) / 10,
  }));
}

/**
 * Play a full game. Returns quarter-by-quarter scores plus a function to
 * apply a halftime bias to the back half — the caller drives it quarter by
 * quarter so the UI can reveal it progressively.
 */
function newGameEngine(starters, bench, tactics, opponent, isHome, coach, bonusSrs) {
  const youSRS = teamStrength(starters, bench, tactics, coach, bonusSrs);
  const oppSRS = opponent.srs;
  const homeAdv = isHome ? 2.2 : -2.2;
  let pregameBias = 0, halftimeBias = 0;

  return {
    youSRS, oppSRS,
    quarters: [],
    playQuarter(q) {
      const bias = q <= 2 ? pregameBias : halftimeBias;
      const [you, opp] = simQuarter(youSRS, oppSRS, tactics, homeAdv, bias);
      this.quarters.push({ you, opp });
      return { you, opp };
    },
    /** Play all four quarters at once, no halftime pause — used for regular-season games. */
    playInstant() {
      for (let q = 1; q <= 4; q++) this.playQuarter(q);
      return this.totals();
    },
    /** Play both quarters of one half (1 or 2) — used by the playoffs live view, which pauses for a decision once per half instead of once per quarter. */
    playHalf(half) {
      this.playQuarter(half * 2 - 1);
      this.playQuarter(half * 2);
      return this.totals();
    },
    applyPregameBias(delta) { pregameBias = delta; },
    applyHalftimeBias(delta) { halftimeBias = delta; },
    /** A named final-possession result, so it shows up in the quarter log as its own line. */
    applyClutchShot(youPts, oppPts) {
      this.quarters.push({ you: youPts, opp: oppPts, clutch: true });
    },
    /** Regulation (plus a resolved clutch shot) still tied — a short extra period, repeated until someone actually has more points. Real overtime is ~5 of a 12-minute quarter's length. */
    playOvertime() {
      const [you, opp] = simQuarter(youSRS, oppSRS, tactics, homeAdv, 0);
      const scaled = { you: Math.round(you * 0.42), opp: Math.round(opp * 0.42) };
      this.quarters.push({ you: scaled.you, opp: scaled.opp, ot: true });
      return this.totals();
    },
    totals() {
      return this.quarters.reduce((acc, q) => ({ you: acc.you + q.you, opp: acc.opp + q.opp }), { you: 0, opp: 0 });
    },
    boxScores() {
      const t = this.totals();
      return {
        you: genBoxScore(starters, bench, t.you, t.you > t.opp),
        opp: null, // opponent box score isn't needed for v1 — only the user's roster matters here
      };
    },
  };
}

const HALFTIME_CHOICES = [
  { key: "push",   label: "Ride the hot hand — keep attacking",  bias: 2.4 },
  { key: "lock",   label: "Tighten up on defense",                bias: 1.6 },
  { key: "steady", label: "Stay the course",                      bias: 0.0 },
];

const PREGAME_CHOICES = [
  { key: "aggressive", label: "Come out aggressive — set the tone early", bias: 2.2 },
  { key: "cautious",   label: "Feel them out, protect against a hot start", bias: 1.2 },
  { key: "balanced",   label: "Trust the game plan — stay balanced",       bias: 0.0 },
];

/*
 * Clutch shot — a genuine "who takes the last shot" decision, offered only
 * when a playoff game is actually tight after regulation (margin small
 * enough that one possession decides it). The odds come from the chosen
 * player's own real shooting splits, not a made-up "clutch rating" — the
 * choice is honest, not decorative.
 */
const CLUTCH_MARGIN = 5; // |you - opp| at or under this after Q4 triggers the moment

function clutchShotType(margin) {
  // margin = you - opp, BEFORE the shot
  if (margin <= -3) return "three"; // down 3+, only a three ties/wins
  return "two"; // down 1-2, tied, or protecting a small lead — a two is the natural shot
}

function clutchCandidates(starters) {
  return starters
    .filter(s => s.player)
    .map(s => s.player)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 3);
}

function resolveClutchShot(player, shotType) {
  const basePct = shotType === "three" ? (player.fg3_pct ?? 0.33) : (player.fg2_pct ?? 0.48);
  const skillNudge = (player.rating - 65) * 0.0025;
  const makeProb = Math.max(0.2, Math.min(0.78, basePct + skillNudge));
  const made = Math.random() < makeProb;
  return { made, pts: made ? (shotType === "three" ? 3 : 2) : 0, makeProb };
}
