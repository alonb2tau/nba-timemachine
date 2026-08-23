/*
 * duel.js — Quick League: up to 5 people join with a shareable code/link,
 * each drafts their own real squad (same draft.js flow as single-player,
 * just pointed at the league server instead of the Team Hub), then every
 * pair of drafted squads plays one head-to-head duel game.
 *
 * The server (server/leagues.py) only ever sees: franchise picks, finished
 * rosters, and final duel results. The actual game — quarters, halftime
 * call, clutch shot — still runs entirely client-side using the same
 * engine as single-player playoff games (sim.js's newDuelEngine), driven
 * by whichever of the two players opens that duel first (the "arbiter").
 * The other player sees the result once it's submitted — no real-time
 * synchronization needed, which keeps this whole feature to one small
 * polling loop instead of a live multiplayer protocol.
 */

let MP = null; // { code, playerId, myName, league }
let MP_LIVE = null; // the duel currently being played/spectated
let mpSelectedFranchiseCode = null;
let mpPollTimer = null;

const DUEL_TACTICS = { pace: "balanced", shots: "balanced", scheme: "solid", offense: "balanced", boards: "balanced", rotation: "balanced" };

async function mpApi(path, opts) {
  const resp = await fetch(`/api/leagues${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body.detail || `request failed (${resp.status})`);
  return body;
}

function mpShareLink() {
  return `${location.origin}${location.pathname}?league=${MP.code}`;
}

function myMpPlayer() {
  return MP.league.players.find(p => p.id === MP.playerId);
}

function stopMpPolling() { clearInterval(mpPollTimer); mpPollTimer = null; }

function startMpPolling(renderFn) {
  stopMpPolling();
  mpPollTimer = setInterval(async () => {
    try {
      MP.league = await mpApi(`/${MP.code}`);
      renderFn();
    } catch (e) { /* transient — try again next tick */ }
  }, 2200);
}

// --------------------------------------------------------------- mode/start --

function wireModeEvents() {
  $("mode-single-btn").addEventListener("click", () => switchPhase("franchise"));
  $("mode-multi-btn").addEventListener("click", () => {
    const params = new URLSearchParams(location.search);
    const joinCode = params.get("league");
    if (joinCode) $("mp-join-code-input").value = joinCode.toUpperCase();
    switchPhase("mp-start");
  });
}

async function mpCreateLeague() {
  const name = $("mp-create-name-input").value.trim();
  if (!name) { toast("Enter your name first."); return; }
  try {
    const data = await mpApi("", { method: "POST", body: JSON.stringify({ name }) });
    MP = { code: data.code, playerId: data.playerId, myName: name, league: data.league };
    enterMpLobby();
  } catch (e) { toast(e.message); }
}

async function mpJoinLeague() {
  const code = $("mp-join-code-input").value.trim().toUpperCase();
  const name = $("mp-join-name-input").value.trim();
  if (!code || !name) { toast("Enter the league code and your name."); return; }
  try {
    const data = await mpApi(`/${code}/join`, { method: "POST", body: JSON.stringify({ name }) });
    MP = { code, playerId: data.playerId, myName: name, league: data.league };
    enterMpLobby();
  } catch (e) { toast(e.message); }
}

// -------------------------------------------------------------------- lobby --

function enterMpLobby() {
  switchPhase("mp-lobby");
  mpSelectedFranchiseCode = null;
  renderMpLobby();
}

function mpFranchiseCardHtml(o, taken) {
  const selected = mpSelectedFranchiseCode === o.code;
  return `<div class="franchise-card ${selected ? "selected" : ""} ${taken ? "taken" : ""}" data-code="${taken ? "" : o.code}">
    ${logoHtml(o.nba_id, o.name, o.colors, 36)}
    <div class="franchise-card-name">${esc(o.name)}</div>
    <div class="franchise-card-meta">${taken ? "Taken" : `${o.conf} &middot; ${o.div}`}</div>
  </div>`;
}

function renderMpLobby() {
  $("mp-lobby-code").textContent = MP.code;
  $("mp-lobby-link").value = mpShareLink();
  $("mp-lobby-players").innerHTML = MP.league.players.map(p => `
    <div class="mp-player-row ${p.id === MP.playerId ? "me" : ""}">
      <span class="mp-player-name">${esc(p.name)}${p.id === MP.playerId ? " (you)" : ""}</span>
      <span class="mp-player-status">${p.franchiseName ? esc(p.franchiseName) : "picking a franchise..."}${p.ready ? " &middot; drafted" : ""}</span>
    </div>`).join("");

  const me = myMpPlayer();
  const pickerSection = $("mp-franchise-pick");
  if (me && me.franchiseCode) {
    pickerSection.classList.add("hidden");
    return;
  }
  pickerSection.classList.remove("hidden");

  const taken = new Set(MP.league.players.filter(p => p.id !== MP.playerId && p.franchiseCode).map(p => p.franchiseCode));
  const opts = franchiseOptions();
  $("mp-franchise-grid").innerHTML = opts.map(o => mpFranchiseCardHtml(o, taken.has(o.code))).join("");
  $("mp-franchise-grid").querySelectorAll(".franchise-card[data-code]:not(.taken)").forEach(el => {
    el.addEventListener("click", () => {
      mpSelectedFranchiseCode = el.dataset.code;
      renderMpLobby();
    });
  });

  const selected = opts.find(o => o.code === mpSelectedFranchiseCode);
  const nameFilled = $("mp-franchise-name-input").value.trim().length > 0;
  $("mp-franchise-confirm-btn").disabled = !selected || !nameFilled;
}

async function mpConfirmFranchise() {
  const selected = franchiseOptions().find(o => o.code === mpSelectedFranchiseCode);
  if (!selected) return;
  const name = $("mp-franchise-name-input").value.trim() || selected.name;
  try {
    MP.league = await mpApi(`/${MP.code}/players/${MP.playerId}/franchise`, {
      method: "POST",
      body: JSON.stringify({ code: selected.code, name, realName: selected.name, colors: selected.colors, nba_id: selected.nba_id }),
    });
  } catch (e) {
    toast(e.message);
    MP.league = await mpApi(`/${MP.code}`);
    renderMpLobby();
    return;
  }
  FRANCHISE = {
    code: selected.code, name, realName: selected.name,
    colors: selected.colors, nba_id: selected.nba_id, conf: selected.conf, div: selected.div,
  };
  $("goto-hub-btn").textContent = "Submit Roster";
  initDraft();
  switchPhase("draft");
}

// -------------------------------------------------------------- post-draft --

async function mpSubmitRoster() {
  const squad = getDraftedSquad();
  try {
    MP.league = await mpApi(`/${MP.code}/players/${MP.playerId}/roster`, {
      method: "POST", body: JSON.stringify(squad),
    });
  } catch (e) { toast(e.message); return; }
  enterMpWaiting();
}

function enterMpWaiting() {
  switchPhase("mp-waiting");
  renderMpWaiting();
  startMpPolling(renderMpWaiting);
}

function mpNameFor(id) {
  const p = MP.league.players.find(x => x.id === id);
  return p ? p.name : "?";
}

function mpDuelRowHtml(d) {
  const involvesMe = d.a.id === MP.playerId || d.b.id === MP.playerId;
  const oppName = d.a.id === MP.playerId ? d.b.name : d.a.name;
  const oppFranchise = d.a.id === MP.playerId ? d.b.franchiseName : d.a.franchiseName;
  let action = "";
  if (d.status === "done") {
    const won = d.result.winnerId === MP.playerId;
    const my = d.a.id === MP.playerId ? d.result.aScore : d.result.bScore;
    const their = d.a.id === MP.playerId ? d.result.bScore : d.result.aScore;
    action = `<span class="mp-duel-result ${won ? "won" : "lost"}">${won ? "W" : "L"} ${my}-${their}</span>
      <button class="btn ghost small" onclick="mpViewDuel('${d.id}')">Box score</button>`;
  } else if (!involvesMe) {
    action = `<span class="mp-duel-pending">${d.status === "live" ? "in progress" : "not yet played"}</span>`;
  } else if (d.status === "pending") {
    action = `<button class="btn primary small" onclick="mpPlayDuel('${d.id}')">Play this duel</button>`;
  } else if (d.status === "live" && d.arbiterId === MP.playerId) {
    action = `<button class="btn primary small" onclick="mpPlayDuel('${d.id}')">Resume</button>`;
  } else {
    action = `<span class="mp-duel-pending">${mpNameFor(d.arbiterId)} is playing this now...</span>`;
  }
  return `<div class="mp-duel-row">
    <span class="mp-duel-matchup">${esc(mpNameFor(d.a.id))} <em>vs</em> ${esc(mpNameFor(d.b.id))}
      <span class="mp-duel-sub">${esc(d.a.franchiseName)} vs ${esc(d.b.franchiseName)}</span></span>
    <span class="mp-duel-action">${action}</span>
  </div>`;
}

function mpStandingsHtml() {
  if (!MP.league.duels.length) return "";
  const rows = [...MP.league.standings].sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  return `<h3 class="hub-subhead">Quick League Standings</h3>
    <div class="mp-standings">${rows.map(r => `
      <div class="mp-standings-row ${r.playerId === MP.playerId ? "me" : ""}">
        <span>${esc(mpNameFor(r.playerId))}</span><span>${r.wins}-${r.losses}</span>
      </div>`).join("")}</div>`;
}

function renderMpWaiting() {
  $("mp-wait-code").textContent = MP.code;
  $("mp-wait-link").value = mpShareLink();
  $("mp-wait-players").innerHTML = MP.league.players.map(p => `
    <div class="mp-player-row ${p.id === MP.playerId ? "me" : ""}">
      <span class="mp-player-name">${esc(p.name)}${p.id === MP.playerId ? " (you)" : ""}</span>
      <span class="mp-player-status">${p.franchiseName ? esc(p.franchiseName) : "still picking..."}${p.ready ? " &middot; ready" : ""}</span>
    </div>`).join("");

  $("mp-duels-list").innerHTML = MP.league.duels.length
    ? MP.league.duels.map(mpDuelRowHtml).join("")
    : `<p class="mp-empty">Duels appear here as soon as a second player finishes drafting.</p>`;

  $("mp-standings-block").innerHTML = mpStandingsHtml();
}

// ---------------------------------------------------------------- duel play --

async function mpPlayDuel(duelId) {
  try {
    const duel = await mpApi(`/${MP.code}/duels/${duelId}/claim`, {
      method: "POST", body: JSON.stringify({ playerId: MP.playerId }),
    });
    startMpDuelView(duel);
  } catch (e) { toast(e.message); }
}

async function mpViewDuel(duelId) {
  const duel = await mpApi(`/${MP.code}/duels/${duelId}`);
  startMpDuelView(duel);
}

function startMpDuelView(duel) {
  switchPhase("mp-duel");
  stopMpPolling();
  const amA = duel.a.id === MP.playerId;
  const me = amA ? duel.a : duel.b;
  const opp = amA ? duel.b : duel.a;

  if (duel.status === "done") {
    renderMpDuelRecap(duel, me, opp);
    return;
  }
  if (duel.arbiterId !== MP.playerId) {
    renderMpDuelSpectate(duel.id);
    return;
  }

  const meBundle = { ...me.roster, tactics: DUEL_TACTICS, name: me.name, franchiseName: me.franchiseName, colors: me.franchiseColors, nba_id: me.franchiseNbaId };
  const oppBundle = { ...opp.roster, tactics: DUEL_TACTICS, name: opp.name, franchiseName: opp.franchiseName, colors: opp.franchiseColors, nba_id: opp.franchiseNbaId };
  const engine = newDuelEngine(meBundle, oppBundle);
  MP_LIVE = {
    duelId: duel.id, amA, me: meBundle, opp: oppBundle, engine,
    quarterStep: 0, halftimeChosen: false, pregameChosen: false,
    awaitingClutch: false, showingClutchResult: false, clutchResolved: false, clutchResult: null, finished: null,
  };
  renderMpDuelScreen();
}

function renderMpDuelSpectate(duelId) {
  $("mp-duel-body").innerHTML = `<div class="mp-spectate">
    <h2>Duel in progress</h2>
    <p>Your opponent is playing this one out right now. The result will appear here the moment they're done.</p>
  </div>`;
  const poll = setInterval(async () => {
    const duel = await mpApi(`/${MP.code}/duels/${duelId}`);
    if (duel.status === "done") {
      clearInterval(poll);
      const amA = duel.a.id === MP.playerId;
      renderMpDuelRecap(duel, amA ? duel.a : duel.b, amA ? duel.b : duel.a);
    }
  }, 2500);
}

function mpBackToWaiting() {
  MP_LIVE = null;
  enterMpWaiting();
}

function mpTeamTagHtml(p) {
  return `${logoHtml(p.nba_id, p.franchiseName, p.colors || ["#333", "#999"], 20)} <span>${esc(p.franchiseName)}</span> <span class="mp-owner">(${esc(p.name)})</span>`;
}

function advanceMpDuel() {
  const live = MP_LIVE;
  if (!live.pregameChosen) return;
  if (live.quarterStep < 4) {
    if (live.quarterStep === 2 && !live.halftimeChosen) return;
    live.quarterStep++;
    live.engine.playQuarter(live.quarterStep);
  }
  if (live.quarterStep === 4 && !live.clutchResolved) {
    live.clutchResolved = true;
    const totals = live.engine.totals();
    if (Math.abs(totals.you - totals.opp) <= CLUTCH_MARGIN) {
      live.awaitingClutch = true;
      renderMpDuelScreen();
      return;
    }
  }
  if (live.quarterStep === 4 && !live.awaitingClutch) { finishMpDuel(); return; }
  renderMpDuelScreen();
}

function chooseMpPregame(bias) {
  MP_LIVE.engine.applyPregameBias(bias);
  MP_LIVE.pregameChosen = true;
  renderMpDuelScreen();
}

function chooseMpHalftime(bias) {
  MP_LIVE.engine.applyHalftimeBias(bias);
  MP_LIVE.halftimeChosen = true;
  renderMpDuelScreen();
}

function takeMpClutchShot(player, shotType) {
  const result = resolveClutchShot(player, shotType);
  MP_LIVE.engine.applyClutchShot(result.pts, 0);
  MP_LIVE.clutchResult = { player, shotType, ...result };
  MP_LIVE.awaitingClutch = false;
  MP_LIVE.showingClutchResult = true;
  renderMpDuelScreen();
}

function mpClutchContinue() {
  MP_LIVE.showingClutchResult = false;
  finishMpDuel();
}

function finishMpDuel() {
  const live = MP_LIVE;
  const totals = live.engine.totals();
  const box = live.engine.boxScores();
  live.finished = { youScore: totals.you, oppScore: totals.opp, youBox: box.you, oppBox: box.opp };
  renderMpDuelScreen();
}

async function submitMpDuelResult() {
  const live = MP_LIVE;
  // "me" is whichever of duel.a/duel.b this arbiter actually is — the score
  // POSTed as aScore/bScore has to follow that, not always assume the
  // arbiter is player A (a wrong-side result silently flips the standings).
  const aScore = live.amA ? live.finished.youScore : live.finished.oppScore;
  const bScore = live.amA ? live.finished.oppScore : live.finished.youScore;
  const aBox = live.amA ? live.finished.youBox : live.finished.oppBox;
  const bBox = live.amA ? live.finished.oppBox : live.finished.youBox;
  try {
    MP.league = await mpApi(`/${MP.code}/duels/${live.duelId}/result`, {
      method: "POST",
      body: JSON.stringify({ playerId: MP.playerId, aScore, bScore, aBox, bBox, quarterLog: live.engine.quarters }),
    });
  } catch (e) { toast(e.message); }
  MP_LIVE = null;
  enterMpWaiting();
}

function mpBoxRows(box, label) {
  return `<h3>${label}</h3><table><thead><tr><th>Player</th><th>Pos</th><th>Pts</th><th>Reb</th><th>Ast</th></tr></thead><tbody>
    ${box.map(p => `<tr class="${p.starter ? "starter" : ""}"><td>${esc(p.name)}</td><td>${p.pos}</td><td>${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td></tr>`).join("")}
    </tbody></table>`;
}

function renderMpDuelScreen() {
  const live = MP_LIVE;
  const totals = live.engine.totals();

  const scoreHeader = `<div class="hero-live">
    <div class="result-score-row">
      <div class="result-team">${mpTeamTagHtml(live.me)}<div class="result-score">${totals.you}</div></div>
      <div class="result-mid">${live.quarterStep >= 4 ? "FINAL" : `Q${live.quarterStep + 1}`}</div>
      <div class="result-team">${mpTeamTagHtml(live.opp)}<div class="result-score">${totals.opp}</div></div>
    </div>
    <div class="quarter-log">${live.engine.quarters.map((q, i) =>
      `<span class="qrow ${q.clutch ? "qrow-clutch" : ""}">${q.clutch ? "Clutch" : `Q${i + 1}`}: ${q.you}-${q.opp}</span>`).join("")}</div>`;

  if (!live.pregameChosen) {
    $("mp-duel-body").innerHTML = `${scoreHeader}
      <div class="halftime-panel"><h3>Tip-off — set the tone</h3>
      <div class="halftime-options">${PREGAME_CHOICES.map(c => `<button data-bias="${c.bias}">${c.label}</button>`).join("")}</div>
      </div></div>`;
    $("mp-duel-body").querySelectorAll(".halftime-options button").forEach(btn =>
      btn.addEventListener("click", () => chooseMpPregame(Number(btn.dataset.bias))));
    return;
  }

  const waitingOnHalftime = live.quarterStep === 2 && !live.halftimeChosen;
  if (waitingOnHalftime) {
    $("mp-duel-body").innerHTML = `${scoreHeader}
      <div class="halftime-panel"><h3>Halftime adjustment</h3>
      <div class="halftime-options">${HALFTIME_CHOICES.map(c => `<button data-bias="${c.bias}">${c.label}</button>`).join("")}</div>
      </div></div>`;
    $("mp-duel-body").querySelectorAll(".halftime-options button").forEach(btn =>
      btn.addEventListener("click", () => chooseMpHalftime(Number(btn.dataset.bias))));
    return;
  }

  if (live.awaitingClutch) {
    const margin = totals.you - totals.opp;
    const shotType = clutchShotType(margin);
    const candidates = clutchCandidates(live.me.starters);
    $("mp-duel-body").innerHTML = `${scoreHeader}
      <div class="clutch-panel">
      <div class="clutch-situation">${margin < 0 ? `You trail by ${-margin}.` : margin === 0 ? "Tied game." : `You lead by ${margin}.`} Final possession.</div>
      <div class="clutch-shot-label">${shotType === "three" ? "You need a three. Who's taking it?" : "One shot decides it. Who's taking it?"}</div>
      <div class="clutch-candidates">${candidates.map((p, i) => `
        <button class="clutch-card" data-idx="${i}">
          ${faceHtml(p.name, p.code, null, 48)}
          <div class="clutch-name">${esc(p.name)}</div>
          <div class="clutch-stats">${p.pts} PPG &middot; ${Math.round((p.fg2_pct || 0) * 100)}% 2PT &middot; ${Math.round((p.fg3_pct || 0) * 100)}% 3PT</div>
        </button>`).join("")}</div>
      </div></div>`;
    $("mp-duel-body").querySelectorAll(".clutch-card").forEach((btn, i) =>
      btn.addEventListener("click", () => takeMpClutchShot(candidates[i], shotType)));
    return;
  }

  if (live.showingClutchResult) {
    const r = live.clutchResult;
    $("mp-duel-body").innerHTML = `${scoreHeader}
      <div class="clutch-panel">
      <div class="clutch-result-headline ${r.made ? "made" : "missed"}">${r.made ? `GOOD! ${esc(r.player.name).toUpperCase()} CONNECTS` : `${esc(r.player.name).toUpperCase()} CAN'T CONVERT`}</div>
      <button id="mp-clutch-continue-btn" class="btn primary">See Final Result</button>
      </div></div>`;
    $("mp-clutch-continue-btn").addEventListener("click", mpClutchContinue);
    return;
  }

  if (live.quarterStep >= 4) {
    const f = live.finished;
    $("mp-duel-body").innerHTML = `${scoreHeader}
      <div class="box-score">
      <h2>${f.youScore >= f.oppScore ? "You win" : "You lose"} — ${f.youScore}-${f.oppScore}</h2>
      <div class="mp-box-cols">${mpBoxRows(f.youBox, esc(live.me.franchiseName))}${mpBoxRows(f.oppBox, esc(live.opp.franchiseName))}</div>
      <button id="mp-submit-result-btn" class="btn primary full">Submit Result</button>
      </div></div>`;
    $("mp-submit-result-btn").addEventListener("click", submitMpDuelResult);
    return;
  }

  $("mp-duel-body").innerHTML = `${scoreHeader}
    <button id="mp-advance-btn" class="btn primary">Simulate Q${live.quarterStep + 1}</button></div>`;
  $("mp-advance-btn").addEventListener("click", advanceMpDuel);
}

function renderMpDuelRecap(duel, me, opp) {
  const myScore = duel.a.id === me.id ? duel.result.aScore : duel.result.bScore;
  const theirScore = duel.a.id === me.id ? duel.result.bScore : duel.result.aScore;
  const myBox = duel.a.id === me.id ? duel.result.aBox : duel.result.bBox;
  const theirBox = duel.a.id === me.id ? duel.result.bBox : duel.result.aBox;
  $("mp-duel-body").innerHTML = `<div class="box-score">
    <h2>${myScore >= theirScore ? "Win" : "Loss"} — ${myScore}-${theirScore} vs ${esc(opp.franchiseName)}</h2>
    <div class="mp-box-cols">${mpBoxRows(myBox, esc(me.franchiseName))}${mpBoxRows(theirBox, esc(opp.franchiseName))}</div>
    <button id="mp-back-btn" class="btn primary full">Back to Quick League</button>
    </div>`;
  $("mp-back-btn").addEventListener("click", mpBackToWaiting);
}

// ------------------------------------------------------------------- wiring --

function wireDuelEvents() {
  wireModeEvents();
  $("mp-create-btn").addEventListener("click", mpCreateLeague);
  $("mp-join-btn").addEventListener("click", mpJoinLeague);
  $("mp-franchise-name-input").addEventListener("input", renderMpLobby);
  $("mp-franchise-confirm-btn").addEventListener("click", mpConfirmFranchise);
  $("mp-copy-lobby-link-btn").addEventListener("click", () => mpCopyLink("mp-lobby-link"));
  $("mp-copy-wait-link-btn").addEventListener("click", () => mpCopyLink("mp-wait-link"));
}

function mpCopyLink(inputId) {
  const el = $(inputId);
  el.select();
  navigator.clipboard?.writeText(el.value).then(() => toast("Link copied.")).catch(() => {});
}
