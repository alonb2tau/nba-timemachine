/*
 * playoffs.js — the real NBA postseason structure: a 7-10 seed Play-In
 * Tournament in each conference, then an 8-team bracket, best-of-7 every
 * round, conference finals, and the Finals.
 *
 * The screen is built around whichever game is actually yours: a big
 * "Game Day" panel up top with the matchup, the series stakes, and a
 * pre-game decision that doubles as your "tip off". If regulation ends
 * with the score tight, the game pauses for one more decision — who takes
 * the final shot — before the result is locked in. The full bracket,
 * ESPN-style (both conferences converging on a center Finals box), sits
 * below as reference. Every game that doesn't involve you resolves
 * instantly the moment both sides are known.
 */

let PLAYOFFS = null;
let PO_LIVE = null; // { a, b, you, opp, engine, halfStep, halftimeChosen, awaitingClutch, clutchResolved, clutchResult, onDone, finished }

function mkSeries(a, b) { return { a, b, gamesA: 0, gamesB: 0, winner: null }; }

function buildConferenceField(conf) {
  const you = { conf: SEASON.yourConf, wins: SEASON.wins, losses: SEASON.losses, srs: teamStrength(HUB.starters, HUB.bench, HUB.tactics, HUB.coach, HUB.triviaBonus) };
  const standings = conferenceStandings(SEASON.aiLeague, conf, SEASON_LENGTH, you);
  const top10 = standings.slice(0, 10).map((r, i) => ({ code: r.code, name: r.name, colors: r.colors, nba_id: r.nba_id, srs: r.srs, isYou: r.isYou, seed: i + 1 }));
  return {
    conf,
    seeds1to6: top10.slice(0, 6),
    playIn: {
      g1: { label: "7-8 Game", a: top10[6], b: top10[7], winner: null, score: null },
      g2: { label: "9-10 Game", a: top10[8], b: top10[9], winner: null, score: null },
      g3: { label: "7th Seed Decider", a: null, b: null, winner: null, score: null },
    },
    seed7: null, seed8: null,
    round1: null, round2: null, round3: null, champion: null,
  };
}

function startPlayoffs() {
  const east = buildConferenceField("East"), west = buildConferenceField("West");
  const inField = cb => cb.seeds1to6.some(t => t.isYou) || [cb.playIn.g1.a, cb.playIn.g1.b, cb.playIn.g2.a, cb.playIn.g2.b].some(t => t.isYou);
  PLAYOFFS = {
    east, west, finals: null,
    userMissedPlayoffs: !inField(east) && !inField(west),
    userEliminatedAt: null, userEliminatedBy: null,
    clutchLog: [], // { made, player, shotType, round } — for the season recap
    seriesLog: [], // { round, opponent, won, gamesFor, gamesAgainst } — every series you actually played
  };
  PO_LIVE = null;
  switchPhase("playoffs");
  advanceEverything();
}

function simInstantGame(aSRS, bSRS, homeAdvA) {
  const total = 210 + gauss() * 10;
  const diff = (aSRS - bSRS + homeAdvA) + gauss() * 8;
  let a = Math.round((total + diff) / 2);
  let b = Math.round((total - diff) / 2);
  if (a === b) a += Math.random() < 0.5 ? 2 : -2;
  return [Math.max(70, a), Math.max(70, b)];
}

function resolveInstant(g, isSeries) {
  if (isSeries) {
    while (g.gamesA < 4 && g.gamesB < 4) {
      const [sa, sb] = simInstantGame(g.a.srs, g.b.srs, 0);
      if (sa >= sb) g.gamesA++; else g.gamesB++;
    }
    g.winner = g.gamesA >= 4 ? g.a : g.b;
  } else {
    const [sa, sb] = simInstantGame(g.a.srs, g.b.srs, 0);
    g.winner = sa >= sb ? g.a : g.b;
    g.score = [sa, sb];
  }
}

function ensureConferenceProgress(cb) {
  for (const gk of ["g1", "g2"]) {
    const g = cb.playIn[gk];
    if (!g.winner && !g.a.isYou && !g.b.isYou) resolveInstant(g, false);
  }
  if (cb.playIn.g1.winner && cb.playIn.g2.winner && !cb.playIn.g3.a) {
    cb.playIn.g3.a = cb.playIn.g1.winner === cb.playIn.g1.a ? cb.playIn.g1.b : cb.playIn.g1.a; // loser of 7-8 game
    cb.playIn.g3.b = cb.playIn.g2.winner;
  }
  if (cb.playIn.g3.a && cb.playIn.g3.b && !cb.playIn.g3.winner && !cb.playIn.g3.a.isYou && !cb.playIn.g3.b.isYou) {
    resolveInstant(cb.playIn.g3, false);
  }
  if (cb.playIn.g1.winner) cb.seed7 = cb.playIn.g1.winner;
  if (cb.playIn.g3.winner) cb.seed8 = cb.playIn.g3.winner;

  if (cb.seed7 && cb.seed8 && !cb.round1) {
    const [s1, s2, s3, s4, s5, s6] = cb.seeds1to6;
    cb.round1 = [mkSeries(s1, cb.seed8), mkSeries(s4, s5), mkSeries(s3, s6), mkSeries(s2, cb.seed7)];
  }
  if (cb.round1) for (const s of cb.round1) if (!s.winner && !s.a.isYou && !s.b.isYou) resolveInstant(s, true);

  if (cb.round1 && cb.round1.every(s => s.winner) && !cb.round2) {
    cb.round2 = [mkSeries(cb.round1[0].winner, cb.round1[1].winner), mkSeries(cb.round1[2].winner, cb.round1[3].winner)];
  }
  if (cb.round2) for (const s of cb.round2) if (!s.winner && !s.a.isYou && !s.b.isYou) resolveInstant(s, true);

  if (cb.round2 && cb.round2.every(s => s.winner) && !cb.round3) {
    cb.round3 = mkSeries(cb.round2[0].winner, cb.round2[1].winner);
  }
  if (cb.round3 && !cb.round3.winner && !cb.round3.a.isYou && !cb.round3.b.isYou) resolveInstant(cb.round3, true);
  if (cb.round3 && cb.round3.winner) cb.champion = cb.round3.winner;
}

function advanceEverything() {
  ensureConferenceProgress(PLAYOFFS.east);
  ensureConferenceProgress(PLAYOFFS.west);
  if (PLAYOFFS.east.champion && PLAYOFFS.west.champion && !PLAYOFFS.finals) {
    PLAYOFFS.finals = mkSeries(PLAYOFFS.east.champion, PLAYOFFS.west.champion);
  }
  if (PLAYOFFS.finals && !PLAYOFFS.finals.winner && !PLAYOFFS.finals.a.isYou && !PLAYOFFS.finals.b.isYou) {
    resolveInstant(PLAYOFFS.finals, true);
  }
  if (PLAYOFFS.finals && PLAYOFFS.finals.winner) {
    renderPlayoffs();
    finishRun(PLAYOFFS.finals.winner);
    return;
  }
  renderPlayoffs();
}

function findUserAction() {
  for (const cb of [PLAYOFFS.east, PLAYOFFS.west]) {
    for (const gk of ["g1", "g2", "g3"]) {
      const g = cb.playIn[gk];
      if (g.a && g.b && !g.winner && (g.a.isYou || g.b.isYou)) {
        return { label: `${cb.conf} Play-In — ${g.label}`, a: g.a, b: g.b, isSeries: false, target: g };
      }
    }
    const rounds = [
      [cb.round1, `${cb.conf} Conference — Round 1`],
      [cb.round2, `${cb.conf} Conference Semifinals`],
      [cb.round3 ? [cb.round3] : null, `${cb.conf} Conference Finals`],
    ];
    for (const [round, label] of rounds) {
      if (!round) continue;
      for (const s of round) {
        if (s && !s.winner && (s.a.isYou || s.b.isYou)) return { label, a: s.a, b: s.b, isSeries: true, target: s };
      }
    }
  }
  if (PLAYOFFS.finals && !PLAYOFFS.finals.winner && (PLAYOFFS.finals.a.isYou || PLAYOFFS.finals.b.isYou)) {
    return { label: "NBA Finals", a: PLAYOFFS.finals.a, b: PLAYOFFS.finals.b, isSeries: true, target: PLAYOFFS.finals };
  }
  return null;
}

// -------------------------------------------------------------- one game --

function beginUserGame(action, bias) {
  const { a, b, isSeries, label, target } = action;
  const you = a.isYou ? a : b;
  const opp = a.isYou ? b : a;
  const engine = newGameEngine(HUB.starters, HUB.bench, HUB.tactics, { srs: opp.srs }, true, HUB.coach, HUB.triviaBonus);
  engine.applyPregameBias(bias);
  PO_LIVE = {
    a, b, you, opp, engine, label, target, isSeries, halfStep: 0, halftimeChosen: false,
    awaitingClutch: false, showingClutchResult: false, clutchResolved: false, clutchResult: null, finished: null,
    onDone: (winner) => {
      if (isSeries) {
        if (winner === target.a) target.gamesA++; else target.gamesB++;
        if (target.gamesA >= 4) target.winner = target.a;
        else if (target.gamesB >= 4) target.winner = target.b;
      } else {
        target.winner = winner;
      }
      if (target.winner && !target.winner.isYou) {
        PLAYOFFS.userEliminatedAt = label;
        PLAYOFFS.userEliminatedBy = opp.name;
      }
      if (target.winner) {
        PLAYOFFS.seriesLog.push(isSeries ? {
          round: label, opponent: opp.name, won: target.winner.isYou, isSeries: true,
          gamesFor: a.isYou ? target.gamesA : target.gamesB,
          gamesAgainst: a.isYou ? target.gamesB : target.gamesA,
        } : {
          round: label, opponent: opp.name, won: target.winner.isYou, isSeries: false,
          score: target.score,
        });
      }
      advanceEverything();
    },
  };
  $("hero-pregame").classList.add("hidden");
  $("hero-live").classList.remove("hidden");
  renderPoLive();
}

function advancePoGame() {
  const live = PO_LIVE;
  if (live.halfStep < 2) {
    if (live.halfStep === 1 && !live.halftimeChosen) return;
    live.halfStep++;
    live.engine.playHalf(live.halfStep);
  }
  if (live.halfStep === 2 && !live.clutchResolved) {
    live.clutchResolved = true;
    const totals = live.engine.totals();
    const diff = totals.you - totals.opp; // you - opp
    // only a real do-or-die moment if you're tied or trailing — up on the
    // scoreboard already means you don't need this shot to win, so there's
    // nothing to ask
    if (diff <= 0 && diff >= -CLUTCH_MARGIN) {
      live.awaitingClutch = true;
      renderPoLive();
      return;
    }
  }
  if (live.halfStep === 2 && !live.awaitingClutch) { finishPoGame(); return; }
  renderPoLive();
}

/** Freeze a choice panel on the pick the user just made for a beat, so a
 * decision-heavy moment (halftime/pregame/clutch) gets a visible "locked
 * in" acknowledgment instead of jumping straight to the next screen. */
function lockInChoice(containerId, chosenBtn, after) {
  $(containerId).querySelectorAll("button").forEach(b => { b.disabled = true; });
  chosenBtn.classList.add("chosen");
  setTimeout(after, 420);
}

function choosePoHalftime(bias) {
  PO_LIVE.engine.applyHalftimeBias(bias);
  PO_LIVE.halftimeChosen = true;
  renderPoLive();
}

function takeClutchShot(player, shotType) {
  const before = PO_LIVE.engine.totals();
  const marginBefore = before.you - before.opp; // you - opp, before this possession
  const result = resolveClutchShot(player, shotType);
  PO_LIVE.engine.applyClutchShot(result.pts, 0);
  PO_LIVE.clutchResult = { player, shotType, marginBefore, ...result };
  PO_LIVE.awaitingClutch = false;
  PO_LIVE.showingClutchResult = true;
  PLAYOFFS.clutchLog.push({ made: result.made, player: player.name, shotType, pts: result.pts, opponent: PO_LIVE.opp.name });
  renderPoLive();
}

function clutchContinue() {
  PO_LIVE.showingClutchResult = false;
  finishPoGame();
}

function finishPoGame() {
  const live = PO_LIVE;
  let totals = live.engine.totals();
  // whoever has more points wins, same rule as everywhere else in this game
  // — a missed clutch shot isn't a special-cased loss, it's just 0 points
  // added. Miss it tied and the score is still tied, so the game genuinely
  // goes to overtime; miss it trailing and you're still trailing, so you
  // lose on the scoreboard, not on a rule.
  while (totals.you === totals.opp) totals = live.engine.playOvertime();
  const won = totals.you > totals.opp;
  const winner = won ? live.you : live.opp;
  const score = live.a === live.you ? [totals.you, totals.opp] : [totals.opp, totals.you];
  live.finished = { winner, score, box: live.engine.boxScores().you, won };
  renderPoLive();
}

function continuePoAfterBox() {
  const { onDone, finished } = PO_LIVE;
  PO_LIVE = null;
  $("hero-live").classList.add("hidden");
  onDone(finished.winner);
}

// ---------------------------------------------------------------- render --

function teamTagHtml(t) {
  return `${logoHtml(t.nba_id, t.name, t.colors, 18)} <span class="${t.isYou ? "you-name" : ""}">${esc(t.name)}</span>`;
}

function heroTeamHtml(t) {
  return `${logoHtml(t.nba_id, t.name, t.colors, 60)}<div class="hero-team-name ${t.isYou ? "you-name" : ""}">${esc(t.name)}</div>`;
}

function seriesStakesText(action) {
  if (!action.isSeries) return "Win-or-go-home Play-In game.";
  const s = action.target;
  const youIsA = s.a.isYou;
  const yourWins = youIsA ? s.gamesA : s.gamesB;
  const theirWins = youIsA ? s.gamesB : s.gamesA;
  if (yourWins === 0 && theirWins === 0) return "Game 1 of the series.";
  if (yourWins === theirWins) return `Series tied ${yourWins}-${theirWins}.`;
  if (yourWins === 3) return `You lead ${yourWins}-${theirWins} — win to close out the series.`;
  if (theirWins === 3) return `You trail ${theirWins}-${yourWins} — elimination game.`;
  return yourWins > theirWins ? `You lead the series ${yourWins}-${theirWins}.` : `You trail the series ${theirWins}-${yourWins}.`;
}

function renderHero() {
  if (PO_LIVE) {
    $("hero-pregame").classList.add("hidden");
    $("hero-live").classList.remove("hidden");
    renderPoLive();
    return;
  }
  $("hero-live").classList.add("hidden");
  const action = findUserAction();
  if (!action) { $("hero-pregame").classList.add("hidden"); return; }
  $("hero-pregame").classList.remove("hidden");

  $("hero-round-label").textContent = action.label;
  $("hero-team-a").innerHTML = heroTeamHtml(action.a);
  $("hero-team-b").innerHTML = heroTeamHtml(action.b);
  $("hero-context").textContent = seriesStakesText(action);
  $("pregame-choices").innerHTML = PREGAME_CHOICES.map(c => `
    <button class="strategy-card" data-bias="${c.bias}">
      <span class="strategy-icon">${c.icon}</span>
      <span class="strategy-title">${esc(c.title)}</span>
      <span class="strategy-sub">${esc(c.sub)}</span>
    </button>`).join("");
  $("pregame-choices").querySelectorAll("button").forEach(btn =>
    btn.addEventListener("click", () => lockInChoice("pregame-choices", btn, () => beginUserGame(action, Number(btn.dataset.bias)))));
}

// ------------------------------------------------------- ESPN-style bracket

function seedTagHtml(t) { return `<span class="seed-tag">${t.seed || ""}</span>`; }

function bracketTeamRowHtml(t, won) {
  return `<div class="bx-team-row ${won ? "winner" : ""}${t.isYou ? " you" : ""}">
    ${seedTagHtml(t)}${logoHtml(t.nba_id, t.name, t.colors, 20)}
    <span class="bx-team-name">${esc(t.name)}</span>
  </div>`;
}

function bracketPlayInCardHtml(g) {
  if (!g.a || !g.b) return `<div class="bx-card bx-placeholder"><span class="tbd">TBD</span></div>`;
  return `<div class="bx-card bx-playin">
    <div class="bx-playin-label">${g.label}</div>
    ${bracketTeamRowHtml(g.a, g.winner === g.a)}
    ${bracketTeamRowHtml(g.b, g.winner === g.b)}
  </div>`;
}

function bracketSeriesCardHtml(s) {
  if (!s || !s.a || !s.b) return `<div class="bx-card bx-placeholder"><span class="tbd">TBD</span></div>`;
  const scoreHtml = (n) => `<span class="bx-score">${n}</span>`;
  return `<div class="bx-card">
    <div class="bx-team-row-wrap">${bracketTeamRowHtml(s.a, s.winner === s.a)}${scoreHtml(s.gamesA)}</div>
    <div class="bx-team-row-wrap">${bracketTeamRowHtml(s.b, s.winner === s.b)}${scoreHtml(s.gamesB)}</div>
  </div>`;
}

function bracketColumnHtml(cards, extraClass) {
  return `<div class="bx-col ${extraClass || ""}">${cards.map(c => `<div class="bx-slot">${c}</div>`).join("")}</div>`;
}

function bracketFinalsHtml() {
  const f = PLAYOFFS.finals;
  if (!f) {
    return `<div class="bx-finals-card bx-placeholder"><div class="bx-finals-label">NBA Finals</div><span class="tbd">Awaiting conference champions</span></div>`;
  }
  const teamBig = (t, score) => `${logoHtml(t.nba_id, t.name, t.colors, 46)}<div class="bx-finals-name ${t.isYou ? "you-name" : ""}">${esc(t.name)}</div><div class="bx-finals-score">${score}</div>`;
  return `<div class="bx-finals-card ${f.winner ? "decided" : ""}">
    <div class="bx-finals-label">NBA Finals</div>
    <div class="bx-finals-matchup">
      <div class="bx-finals-side ${f.winner === f.a ? "winner" : ""}">${teamBig(f.a, f.gamesA)}</div>
      <div class="bx-finals-vs">vs</div>
      <div class="bx-finals-side ${f.winner === f.b ? "winner" : ""}">${teamBig(f.b, f.gamesB)}</div>
    </div>
    ${f.winner ? `<div class="bx-finals-champion">${esc(f.winner.name)} WIN THE TITLE</div>` : ""}
  </div>`;
}

function renderBracket() {
  const east = PLAYOFFS.east, west = PLAYOFFS.west;

  const westCols = [
    bracketColumnHtml([bracketPlayInCardHtml(west.playIn.g1), bracketPlayInCardHtml(west.playIn.g2), bracketPlayInCardHtml(west.playIn.g3)], "bx-col-playin"),
    bracketColumnHtml((west.round1 || [null, null, null, null]).map(bracketSeriesCardHtml)),
    bracketColumnHtml((west.round2 || [null, null]).map(bracketSeriesCardHtml)),
    bracketColumnHtml([west.round3 ? bracketSeriesCardHtml(west.round3) : bracketSeriesCardHtml(null)]),
  ];
  const eastCols = [
    bracketColumnHtml([east.round3 ? bracketSeriesCardHtml(east.round3) : bracketSeriesCardHtml(null)]),
    bracketColumnHtml((east.round2 || [null, null]).map(bracketSeriesCardHtml)),
    bracketColumnHtml((east.round1 || [null, null, null, null]).map(bracketSeriesCardHtml)),
    bracketColumnHtml([bracketPlayInCardHtml(east.playIn.g1), bracketPlayInCardHtml(east.playIn.g2), bracketPlayInCardHtml(east.playIn.g3)], "bx-col-playin"),
  ];

  const headerRow = (labels) => labels.map(l => `<div class="bx-round-head">${l}</div>`).join("");

  $("bracket").innerHTML = `
    <div class="bx-conf-titles">
      <div class="bx-conf-title">Western Conference</div>
      <div class="bx-conf-title">Eastern Conference</div>
    </div>
    <span class="bx-scroll-hint">&larr; Scroll to see the full bracket &rarr;</span>
    <div class="bx-grid">
      <div class="bx-headers">${headerRow(["Play-In", "1st Round", "Conf. Semis", "Conf. Finals", "", "Conf. Finals", "Conf. Semis", "1st Round", "Play-In"])}</div>
      <div class="bx-body">
        ${westCols.join("")}
        <div class="bx-col bx-col-finals">${bracketFinalsHtml()}</div>
        ${eastCols.join("")}
      </div>
    </div>`;
}

function findYourSeed() {
  for (const cb of [PLAYOFFS.east, PLAYOFFS.west]) {
    const all = cb.seeds1to6.concat([cb.playIn.g1.a, cb.playIn.g1.b, cb.playIn.g2.a, cb.playIn.g2.b].filter(Boolean));
    const mine = all.find(t => t.isYou);
    if (mine) return mine.seed;
  }
  return null;
}

/** Always-visible summary of your own playoff run — round, series score,
 * and a few relevant numbers — so checking "where do I stand" doesn't mean
 * parsing the entire bracket every time. */
function renderSeriesStatus() {
  const el = $("series-status");
  let label, opp, isSeries, gamesFor, gamesAgainst, extra = "";

  if (PO_LIVE) {
    label = PO_LIVE.label;
    opp = PO_LIVE.opp;
    isSeries = PO_LIVE.isSeries;
    if (isSeries) {
      gamesFor = PO_LIVE.a.isYou ? PO_LIVE.target.gamesA : PO_LIVE.target.gamesB;
      gamesAgainst = PO_LIVE.a.isYou ? PO_LIVE.target.gamesB : PO_LIVE.target.gamesA;
    }
  } else {
    const action = findUserAction();
    if (action) {
      label = action.label;
      opp = action.a.isYou ? action.b : action.a;
      isSeries = action.isSeries;
      if (isSeries) {
        gamesFor = action.a.isYou ? action.target.gamesA : action.target.gamesB;
        gamesAgainst = action.a.isYou ? action.target.gamesB : action.target.gamesA;
      }
    } else if (PLAYOFFS.seriesLog.length) {
      const last = PLAYOFFS.seriesLog[PLAYOFFS.seriesLog.length - 1];
      label = last.round; opp = { name: last.opponent };
      isSeries = last.isSeries;
      gamesFor = last.gamesFor; gamesAgainst = last.gamesAgainst;
      extra = last.won ? "Series won — advancing." : "Eliminated.";
    } else if (PLAYOFFS.userMissedPlayoffs) {
      label = "Missed the Play-In";
    }
  }

  if (!label) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");

  $("series-status-round").textContent = label;
  $("series-status-opp").textContent = opp ? `vs ${opp.name}` : "";
  $("series-status-score").classList.toggle("hidden", !isSeries);
  if (isSeries) {
    $("series-you-wins").textContent = gamesFor;
    $("series-opp-wins").textContent = gamesAgainst;
  }

  const record = PLAYOFFS.seriesLog.reduce((acc, s) => {
    if (s.isSeries) { acc.w += s.gamesFor; acc.l += s.gamesAgainst; }
    return acc;
  }, { w: 0, l: 0 });
  $("series-stat-record").textContent = `${record.w}-${record.l}`;
  const seed = findYourSeed();
  $("series-stat-seed").textContent = seed ? `#${seed}` : "—";
  $("series-stat-regszn").textContent = SEASON ? `${SEASON.wins}-${SEASON.losses}` : "—";
  $("series-status-extra").textContent = extra;
  $("series-status-extra").classList.toggle("hidden", !extra);
}

function renderPlayoffs() {
  renderHero();
  renderSeriesStatus();
  renderBracket();
}

function renderPoLive() {
  const live = PO_LIVE;
  const totals = live.engine.totals();
  $("po-you-name").innerHTML = teamTagHtml(live.you);
  $("po-opp-name").innerHTML = teamTagHtml(live.opp);
  $("po-you-score").textContent = totals.you;
  $("po-opp-score").textContent = totals.opp;
  $("po-quarter").textContent = live.halfStep >= 2 ? "FINAL" : live.halfStep === 0 ? "1st Half" : "2nd Half";
  $("po-quarter-log").innerHTML = live.engine.quarters.map((q, i) =>
    `<span class="qrow ${q.clutch ? "qrow-clutch" : ""}">${q.clutch ? "Clutch" : q.ot ? "OT" : `Q${i + 1}`}: ${q.you}-${q.opp}</span>`).join("");

  const waitingOnHalftime = live.halfStep === 1 && !live.halftimeChosen;
  $("po-halftime-panel").classList.toggle("hidden", !waitingOnHalftime);
  if (waitingOnHalftime) {
    $("po-halftime-options").innerHTML = HALFTIME_CHOICES.map(c => `
      <button class="strategy-card" data-bias="${c.bias}">
        <span class="strategy-icon">${c.icon}</span>
        <span class="strategy-title">${esc(c.title)}</span>
        <span class="strategy-sub">${esc(c.sub)}</span>
      </button>`).join("");
    $("po-halftime-options").querySelectorAll("button").forEach(btn =>
      btn.addEventListener("click", () => lockInChoice("po-halftime-options", btn, () => choosePoHalftime(Number(btn.dataset.bias)))));
  }

  const advBtn = $("po-advance-btn"), boxDiv = $("po-box-score"), clutchDiv = $("po-clutch-panel");
  if (live.awaitingClutch) {
    advBtn.classList.add("hidden");
    boxDiv.classList.add("hidden");
    clutchDiv.classList.remove("hidden");
    renderClutchPanel();
  } else if (live.showingClutchResult) {
    advBtn.classList.add("hidden");
    boxDiv.classList.add("hidden");
    clutchDiv.classList.remove("hidden");
    renderClutchResult();
  } else if (live.halfStep >= 2) {
    advBtn.classList.add("hidden");
    clutchDiv.classList.add("hidden");
    boxDiv.classList.remove("hidden");
    renderPoBox();
  } else {
    clutchDiv.classList.add("hidden");
    boxDiv.classList.add("hidden");
    advBtn.classList.toggle("hidden", waitingOnHalftime);
    advBtn.textContent = live.halfStep === 0 ? "Simulate 1st Half" : "Simulate 2nd Half";
  }
}

function renderClutchPanel() {
  const live = PO_LIVE;
  const totals = live.engine.totals();
  const margin = totals.you - totals.opp;
  const shotType = clutchShotType(margin);
  const candidates = clutchCandidates(HUB.starters);

  $("clutch-result").classList.add("hidden");
  $("clutch-picker").classList.remove("hidden");

  $("clutch-situation").textContent = margin < 0
    ? `You trail by ${-margin}. Final possession — miss this and it's over.`
    : "Tied game. Final possession — miss this and we play overtime.";
  $("clutch-shot-label").textContent = shotType === "three"
    ? "You need a three to tie or win it. Who's taking it?"
    : "One shot to tie or win it. Who's taking it?";

  $("clutch-candidates").innerHTML = candidates.map((p, i) => `
    <button class="clutch-card" data-idx="${i}">
      ${faceHtml(p.name, p.code, null, 48)}
      <div class="clutch-name">${esc(p.name)}</div>
      <div class="clutch-stats">${p.pts} PPG &middot; ${Math.round((p.fg2_pct || 0) * 100)}% 2PT &middot; ${Math.round((p.fg3_pct || 0) * 100)}% 3PT</div>
    </button>`).join("");
  $("clutch-candidates").querySelectorAll(".clutch-card").forEach((btn, i) =>
    btn.addEventListener("click", () => lockInChoice("clutch-candidates", btn, () => takeClutchShot(candidates[i], shotType))));
}

function renderClutchResult() {
  const r = PO_LIVE.clutchResult;
  $("clutch-candidates").innerHTML = "";
  $("clutch-picker").classList.add("hidden");
  $("clutch-result").classList.remove("hidden");
  $("clutch-result").innerHTML = `
    <div class="clutch-result-headline ${r.made ? "made" : "missed"}">
      ${r.made ? `GOOD! ${esc(r.player.name).toUpperCase()} CONNECTS` : `${esc(r.player.name).toUpperCase()} CAN'T CONVERT`}
    </div>
    <div class="clutch-result-sub">${r.made ? `+${r.pts} on the ${r.shotType === "three" ? "three" : "shot"}.` : "The rim says no."}</div>
    <button id="clutch-continue-btn" class="btn primary">See Final Result</button>`;
  $("clutch-continue-btn").addEventListener("click", clutchContinue);
}

function renderPoBox() {
  const result = PO_LIVE.finished;
  const rowsHtml = result.box.map(p => `
    <tr class="${p.starter ? "starter" : ""}"><td>${esc(p.name)}</td><td>${p.pos}</td><td>${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.stl}</td><td>${p.blk}</td></tr>`).join("");
  $("po-box-score").innerHTML = `
    <h3>${result.won ? "Win" : "Loss"} — ${result.score[0]}-${result.score[1]} vs ${esc(PO_LIVE.opp.name)}</h3>
    <table><thead><tr><th>Player</th><th>Pos</th><th>Pts</th><th>Reb</th><th>Ast</th><th>Stl</th><th>Blk</th></tr></thead>
    <tbody>${rowsHtml}</tbody></table>
    <button id="po-continue-btn" class="btn primary full">Continue</button>`;
  $("po-continue-btn").addEventListener("click", continuePoAfterBox);
}

function wirePlayoffsEvents() {
  $("po-advance-btn").addEventListener("click", advancePoGame);
}
