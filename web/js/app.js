/*
 * app.js — the phase router. Owns which of the five screens (draft, team
 * hub, season, playoffs, end) is visible, and the top bar stat that
 * changes meaning per phase. Each phase's own logic lives in its own file
 * (draft.js, hub.js, season.js, playoffs.js); this file just wires them
 * together in sequence.
 */

const PHASE_ORDER = ["franchise", "draft", "hub", "season", "playoffs"];
let currentPhase = "franchise";
let furthestPhaseIdx = 0; // how far into PHASE_ORDER this run has actually reached — the ceiling for free nav-bar jumps
let DIFFICULTY = null;

const DIFFICULTY_LABELS = { easy: "Easy", medium: "Medium", hard: "Hard", veryhard: "Very Hard" };

function switchPhase(name) {
  currentPhase = name;
  document.querySelectorAll(".phase").forEach(el => el.classList.add("hidden"));
  $(`phase-${name}`).classList.remove("hidden");
  // every phase starts at its own top — without this, scroll position carries
  // over from whatever phase you were just on (e.g. scrolled past the landing
  // hero) and the next phase opens already scrolled past its first field
  window.scrollTo(0, 0);

  const idx = PHASE_ORDER.indexOf(name);
  if (idx > furthestPhaseIdx) furthestPhaseIdx = idx;
  document.querySelectorAll(".phase-step").forEach(el => {
    const stepIdx = PHASE_ORDER.indexOf(el.dataset.phase);
    el.classList.toggle("active", el.dataset.phase === name);
    el.classList.toggle("done", stepIdx >= 0 && idx >= 0 && stepIdx < idx);
    el.classList.toggle("navigable", stepIdx >= 0 && stepIdx <= furthestPhaseIdx);
  });
  refreshTopbar();
}

/** The topbar phase labels double as free back/forward navigation — jump
 * to any phase you've already reached, from anywhere. Only re-renders the
 * destination (switchPhase never mutates game state), so hopping back to
 * Season mid-Playoffs is just "look at it again," not "redo it." */
function goToPhase(name) {
  const idx = PHASE_ORDER.indexOf(name);
  if (idx < 0 || idx > furthestPhaseIdx) return;
  switchPhase(name);
  if (name === "hub" && HUB) renderHub();
  else if (name === "season" && SEASON) renderSeason();
  else if (name === "playoffs" && PLAYOFFS) renderPlayoffs();
}

function wirePhaseNav() {
  document.querySelectorAll(".phase-step").forEach(el => {
    bindActivate(el, () => goToPhase(el.dataset.phase));
  });
}

function refreshTopbar() {
  const el = $("topbar-stat");
  if (currentPhase === "draft" && state) {
    el.innerHTML = `Budget: <span class="accent">€${state.budget.toFixed(1)}M</span>`;
    el.classList.toggle("over", state.budget < 0);
  } else if (currentPhase === "hub" && HUB) {
    el.innerHTML = `Budget: <span class="accent">€${HUB.budget.toFixed(1)}M</span> &nbsp;·&nbsp; Rating: <span class="accent">${Math.round(squadRating(HUB.starters, HUB.bench, HUB.tactics.rotation))}</span>`;
    el.classList.remove("over");
  } else if ((currentPhase === "season" || currentPhase === "playoffs") && SEASON) {
    el.innerHTML = `Record: <span class="accent">${SEASON.wins}-${SEASON.losses}</span>`;
    el.classList.remove("over");
  } else {
    el.textContent = "";
  }
}

function seasonSeed() {
  const you = { conf: SEASON.yourConf, wins: SEASON.wins, losses: SEASON.losses, srs: teamStrength(HUB.starters, HUB.bench, HUB.tactics, HUB.coach, HUB.triviaBonus) };
  const standings = conferenceStandings(SEASON.aiLeague, SEASON.yourConf, SEASON_LENGTH, you);
  return standings.findIndex(r => r.isYou) + 1;
}

function rosterLeaders() {
  const roster = HUB.starters.concat(HUB.bench).filter(s => s.player).map(s => s.player);
  const topBy = key => [...roster].sort((a, b) => b[key] - a[key])[0];
  return { scoring: topBy("pts"), rebounding: topBy("reb"), assists: topBy("ast") };
}

function howFarText(wonIt) {
  if (wonIt) return "NBA Champions";
  if (PLAYOFFS.userEliminatedAt) return `Eliminated in the ${PLAYOFFS.userEliminatedAt}`;
  if (PLAYOFFS.userMissedPlayoffs) return "Missed the Play-In";
  return "Season complete";
}

function recapStatTile(label, value) {
  return `<div class="stat-tile"><div class="stat-tile-val">${value}</div><div class="stat-tile-label">${label}</div></div>`;
}

function recapLeaderRow(role, p) {
  if (!p) return "";
  const statText = role === "Scoring" ? `${p.pts} PPG` : role === "Rebounding" ? `${p.reb} RPG` : `${p.ast} APG`;
  return `<div class="recap-leader-row">
    ${faceHtml(p.name, p.code, null, 44)}
    <div><div class="recap-leader-role">${role} Leader</div><div class="recap-leader-name">${esc(p.name)}</div></div>
    <div class="recap-leader-stat">${statText}</div>
  </div>`;
}

function recapSeriesRow(entry) {
  const cls = entry.won ? "won" : "lost";
  const scoreText = entry.isSeries ? `${entry.gamesFor}-${entry.gamesAgainst}` : `${entry.score ? entry.score.join("-") : ""}`;
  return `<div class="recap-timeline-row ${cls}">
    <span class="recap-timeline-result">${entry.won ? "W" : "L"}</span>
    <span class="recap-timeline-round">${entry.round}</span>
    <span class="recap-timeline-opp">vs ${esc(entry.opponent)}</span>
    <span class="recap-timeline-score">${scoreText}</span>
  </div>`;
}

function recapClutchRow(c) {
  return `<div class="recap-clutch-row ${c.made ? "made" : "missed"}">
    <span class="recap-clutch-icon">${c.made ? "✓" : "✗"}</span>
    ${esc(c.player)} ${c.made ? `hit the go-ahead ${c.shotType === "three" ? "three" : "shot"}` : `missed the final shot`} vs ${esc(c.opponent)}
  </div>`;
}

function lbRowHtml(e, isYou) {
  return `<div class="lb-row ${isYou ? "you" : ""}">
    <div class="lb-rank">${e.rank}</div>
    <div class="lb-team">${esc(e.team_name)}</div>
    <div class="lb-record">${e.wins}-${e.losses}</div>
    <div class="lb-result">${esc(e.result_label)}</div>
  </div>`;
}

async function renderLeaderboard() {
  const section = $("recap-leaderboard-card");
  if (!section) return;
  section.classList.add("hidden");
  if (!DIFFICULTY) return;
  try {
    const runId = getCurrentRunId();
    const res = await fetch(`/api/leaderboard?difficulty=${encodeURIComponent(DIFFICULTY)}&run_id=${encodeURIComponent(runId || "")}`);
    const data = await res.json();
    if (!data.enabled || !data.top) return;

    $("recap-leaderboard-title").textContent = `This Week — ${DIFFICULTY_LABELS[DIFFICULTY] || DIFFICULTY} Leaderboard`;
    $("recap-leaderboard-rank").textContent = data.your_rank
      ? `You ranked #${data.your_rank} of ${data.total_entries} this week.`
      : `${data.total_entries} team${data.total_entries === 1 ? "" : "s"} on the board this week.`;

    const rows = data.top.map(e => lbRowHtml(e, e.run_id === runId));
    if (data.your_entry && data.your_rank > data.top.length) {
      rows.push(`<div class="lb-gap">&#8942;</div>`, lbRowHtml(data.your_entry, true));
    }
    $("recap-leaderboard-rows").innerHTML = rows.join("") || `<div class="recap-empty">No completed runs on this difficulty yet this week.</div>`;
    section.classList.remove("hidden");
  } catch (e) { /* leaderboard is a bonus, never block the recap screen */ }
}

function finishRun(winnerSeed) {
  const wonIt = winnerSeed.isYou;
  const seed = seasonSeed();
  const winPct = (SEASON.wins / Math.max(1, SEASON.wins + SEASON.losses) * 100).toFixed(1);
  const chem = chemistryBonus(HUB.starters, HUB.bench, HUB.coach);
  const leaders = rosterLeaders();

  sendStatEvent("season_finished", {
    games_played: SEASON.wins + SEASON.losses,
    wins: SEASON.wins,
    losses: SEASON.losses,
    conference: SEASON.yourConf,
    final_seed: seed,
    made_playoffs: !PLAYOFFS.userMissedPlayoffs,
    playoff_result: wonIt ? "champion" : (PLAYOFFS.userEliminatedAt || (PLAYOFFS.userMissedPlayoffs ? "missed_playin" : null)),
  });

  $("recap-banner").classList.toggle("champion", wonIt);
  $("recap-trophy").innerHTML = wonIt ? TROPHY_SVG : "";
  $("recap-trophy").classList.toggle("hidden", !wonIt);
  $("recap-title").textContent = wonIt ? `${FRANCHISE.name} — NBA Champions` : `${FRANCHISE.name} — ${howFarText(false)}`;
  $("recap-subtitle").textContent = wonIt
    ? `A ${SEASON.wins}-${SEASON.losses} season ends with a championship.`
    : PLAYOFFS.userEliminatedAt
      ? `Eliminated by ${PLAYOFFS.userEliminatedBy}. ${winnerSeed.name} went on to win the title.`
      : PLAYOFFS.userMissedPlayoffs
        ? `Didn't finish in the top 10 of the ${SEASON.yourConf}. ${winnerSeed.name} won the title.`
        : `${winnerSeed.name} won the title.`;

  $("recap-stats").innerHTML = [
    recapStatTile("Record", `${SEASON.wins}-${SEASON.losses}`),
    recapStatTile("Win %", `${winPct}%`),
    recapStatTile(`${SEASON.yourConf} Seed`, `#${seed}`),
    recapStatTile("Longest Win Streak", `${SEASON.longestWinStreak}`),
    SEASON.biggestWin ? recapStatTile("Biggest Win", `+${SEASON.biggestWin.margin} vs ${SEASON.biggestWin.opponent}`) : "",
    SEASON.closestWin ? recapStatTile("Nail-Biter", `+${SEASON.closestWin.margin} vs ${SEASON.closestWin.opponent}`) : "",
  ].join("");

  $("recap-leaders").innerHTML =
    recapLeaderRow("Scoring", leaders.scoring) +
    recapLeaderRow("Rebounding", leaders.rebounding) +
    recapLeaderRow("Assists", leaders.assists);

  $("recap-playoff-run").innerHTML = PLAYOFFS.seriesLog.length
    ? PLAYOFFS.seriesLog.map(recapSeriesRow).join("")
    : `<div class="recap-empty">Didn't make the playoffs this season.</div>`;
  if (PLAYOFFS.clutchLog.length) {
    $("recap-playoff-run").innerHTML += `<div class="recap-clutch-heading">Clutch Moments</div>` +
      PLAYOFFS.clutchLog.map(recapClutchRow).join("");
  }

  const c = HUB.coach;
  $("recap-front-office").innerHTML = `
    <div class="recap-fo-row">
      ${coachFaceHtml(c.name, c.code, null, 46)}
      <div><div class="recap-fo-label">Head Coach</div><div class="recap-fo-value">${esc(c.name)} &middot; ${signedNum(c.srsBonus)} SRS</div></div>
    </div>
    <div class="recap-fo-row">
      <div class="recap-fo-icon">&#8644;</div>
      <div><div class="recap-fo-label">Team Chemistry</div><div class="recap-fo-value">+${chem.bonus.toFixed(1)} SRS from ${chem.links.length} real connection${chem.links.length === 1 ? "" : "s"}</div></div>
    </div>`;

  setTimeout(() => {
    document.querySelectorAll(".phase").forEach(el => el.classList.add("hidden"));
    $("phase-end").classList.remove("hidden");
    renderLeaderboard(); // fired after the delay above so the just-finished run has landed server-side
  }, 1200);
}

function wireDifficultyEvents() {
  document.querySelectorAll(".mode-card[data-budget]").forEach(btn => {
    btn.addEventListener("click", () => {
      BUDGET = Number(btn.dataset.budget);
      DIFFICULTY = btn.dataset.diff;
      startNewRun(); // a fresh game starts here — give it its own telemetry row
      sendStatEvent("difficulty_chosen", { difficulty: btn.dataset.diff, budget: BUDGET });
      switchPhase("franchise");
    });
  });
}

function wireAppEvents() {
  $("goto-hub-btn").addEventListener("click", () => {
    // revisiting the (already-complete) draft screen via the nav bar — never
    // re-init the hub, that would silently swap out the live team mid-season
    if (HUB) { switchPhase("hub"); renderHub(); return; }
    if (!draftIsComplete()) return;
    initHub(getDraftedSquad());
    wireSeasonEvents();
    wirePlayoffsEvents();
    sendStatEvent("draft_completed", { franchise_code: FRANCHISE.code, franchise_name: FRANCHISE.name });
    initTrivia();
    switchPhase("trivia");
  });
  $("start-season-btn").addEventListener("click", () => {
    // same idea — a season already in progress (or done) just gets shown,
    // never re-simulated from scratch
    if (SEASON) {
      $("start-season-btn").dataset.mode = "";
      $("hub-checkpoint-banner").classList.add("hidden");
      switchPhase("season");
      renderSeason();
      return;
    }
    startSeason();
    sendStatEvent("season_started", {});
    switchPhase("season");
  });
  $("checkpoint-trade-btn").addEventListener("click", offerOneTrade);
  $("new-run-btn").addEventListener("click", () => location.reload());
}

/** Scroll-triggered entrances for the landing hero and any other .reveal
 * element — fires once per element, then stops observing it. Reduced-motion
 * users get everything visible immediately via the CSS override instead. */
function wireScrollReveal() {
  const targets = document.querySelectorAll(".reveal");
  if (!targets.length) return;
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.15 });
  targets.forEach(el => io.observe(el));
}

function wireTopbarCondense() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  window.addEventListener("scroll", () => {
    topbar.classList.toggle("condensed", window.scrollY > 40);
  }, { passive: true });
}

function wireLandingHero() {
  const scrollToModes = () => $("mode-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  $("landing-cta-btn")?.addEventListener("click", scrollToModes);
  $("landing-scroll-cue")?.addEventListener("click", scrollToModes);
}

async function boot() {
  wireAppEvents();
  wireDifficultyEvents();
  wirePhaseNav();
  wireLandingHero();
  wireScrollReveal();
  wireTopbarCondense();
  await initFranchise();
  switchPhase("mode");
}

boot();
