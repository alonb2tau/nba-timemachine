/*
 * accolades.js — a roster's real hardware matters. A player who actually
 * won MVP, made an All-NBA team, or led the league in a major stat that
 * season, or a coach who actually won Coach of the Year, adds a genuine
 * team-strength bonus here — the same shape as chemistry.js's bonus, and
 * fed into teamStrength() the same way. Built entirely from data already
 * on each player/coach (the `awards` and `ledStat` fields from parse.py,
 * `coachOfYear` on the coach) — no extra scraping.
 */

// Voting-ranked awards: the winner (rank 1) matters most, a top-5 finish
// still means something, anything else on the ballot is a light nod.
const RANKED_AWARD_TIERS = {
  MVP:   { win: 10, top5: 4,   rest: 1.5 },
  DPOY:  { win: 6,  top5: 3,   rest: 1 },
  ROY:   { win: 4,  top5: 2,   rest: 0.5 },
  "6MOY": { win: 3, top5: 1.5, rest: 0.5 },
  MIP:   { win: 3,  top5: 1.5, rest: 0.5 },
};
const RANKED_AWARD_LABELS = { MVP: "MVP", DPOY: "DPOY", ROY: "ROY", "6MOY": "6th Man", MIP: "Most Improved" };

// Flat, no-rank awards (team selections).
const FLAT_AWARD_POINTS = { AS: 2, NBA1: 6, NBA2: 4, NBA3: 3, DEF1: 4, DEF2: 2.5 };
const FLAT_AWARD_LABELS = {
  AS: "All-Star", NBA1: "All-NBA 1st", NBA2: "All-NBA 2nd", NBA3: "All-NBA 3rd",
  DEF1: "All-Defense 1st", DEF2: "All-Defense 2nd",
};

const LED_STAT_POINTS = 3;
const LED_STAT_LABELS = { PTS: "Scoring", REB: "Rebounding", AST: "Assists", WS: "Win Shares" };
const COACH_OF_YEAR_POINTS = 8;

const ACCOLADE_POINT_TO_SRS = 0.15;
const ACCOLADE_CAP = 4.0;

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Every real accolade on one player, as {label, points}. */
function playerAwardBadges(p) {
  const badges = [];
  for (const raw of (p.awards || "").split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const ranked = token.match(/^(MVP|DPOY|ROY|6MOY|MIP)-(\d+)$/);
    if (ranked) {
      const kind = ranked[1], rank = Number(ranked[2]);
      const tier = RANKED_AWARD_TIERS[kind];
      const points = rank === 1 ? tier.win : rank <= 5 ? tier.top5 : tier.rest;
      const label = rank === 1 ? `${RANKED_AWARD_LABELS[kind]} Winner` : `${RANKED_AWARD_LABELS[kind]} (${ordinal(rank)})`;
      badges.push({ label, points });
      continue;
    }
    if (FLAT_AWARD_POINTS[token] != null) {
      badges.push({ label: FLAT_AWARD_LABELS[token], points: FLAT_AWARD_POINTS[token] });
    }
  }
  for (const stat of (p.ledStat || [])) {
    badges.push({ label: `League Leader — ${LED_STAT_LABELS[stat] || stat}`, points: LED_STAT_POINTS });
  }
  return badges;
}

/**
 * Total accolades bonus for a roster, weighted the same starters/bench
 * split as team strength itself (a star's real MVP season carries less
 * weight here if you buried them on your bench) — plus a flat bonus if
 * the coach really did win Coach of the Year with this exact team-season.
 */
function accoladesBonus(starters, bench, coach, rotationKey) {
  const w = (typeof rotationWeights === "function") ? rotationWeights(rotationKey) : { starters: 0.75, bench: 0.25 };
  const entries = starters.filter(s => s.player).map(s => ({ player: s.player, weight: w.starters }))
    .concat(bench.filter(s => s.player).map(s => ({ player: s.player, weight: w.bench })));

  let points = 0;
  const badges = [];
  for (const { player, weight } of entries) {
    for (const b of playerAwardBadges(player)) {
      points += b.points * weight;
      badges.push({ name: player.name, code: player.code, ...b });
    }
  }
  if (coach && coach.coachOfYear) {
    points += COACH_OF_YEAR_POINTS;
    badges.push({ name: coach.name, code: coach.code, label: "Coach of the Year", points: COACH_OF_YEAR_POINTS });
  }
  badges.sort((a, b) => b.points - a.points);
  const bonus = Math.min(ACCOLADE_CAP, points * ACCOLADE_POINT_TO_SRS);
  return { bonus, badges };
}
