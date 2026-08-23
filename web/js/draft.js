/*
 * draft.js — the draft: draw a (season, team), pick one player OR that
 * team's real historical coach from it, repeat until the 10-man roster
 * and the coach slot are both filled — one shared $100M cap for all 11.
 *
 * Mirrors Euroball's draft loop (drawNew / swapYear / swapTeam / pickPlayer)
 * but reads NBA data and NBA-native ratings computed by pipeline/ratings.py.
 */

const BUDGET = 100; // 10 players + 1 coach, all from one shared cap
const COACH_MIN_PRICE = 1; // cheapest coach on the board — reserved until one is hired
const SLOT_POSITIONS = ["G", "G", "F", "F", "C"];

function posBucket(pos) {
  if (pos === "PG" || pos === "SG") return "G";
  if (pos === "SF" || pos === "PF") return "F";
  return "C"; // C, or anything unexpected — safer to bucket as C than crash
}

let state = null;

function newState() {
  return {
    starters: SLOT_POSITIONS.map(pos => ({ pos, player: null })),
    bench: SLOT_POSITIONS.map(pos => ({ pos, player: null })),
    coach: null,
    budget: BUDGET,
    pickedNames: new Set(),
    swapYearLeft: 2,
    swapTeamLeft: 2,
    draw: null, // { year, code, team }
    lastCode: null,
  };
}

const allSlots = () => state.starters.concat(state.bench);
const filledCount = () => allSlots().filter(s => s.player).length;
const remainingSlots = () => 10 - filledCount();
// reserve at least 1M for every player slot still open after this pick,
// plus 1M for the coach if one hasn't been hired yet
const maxAffordable = () => state.budget - (remainingSlots() - 1) * 1 - (state.coach ? 0 : COACH_MIN_PRICE);
// evaluating the coach itself: reserve for remaining player slots, no extra coach buffer
const maxAffordableForCoach = () => state.budget - remainingSlots() * 1;

function openBucketsAvailable() {
  const open = new Set();
  for (const s of allSlots()) if (!s.player) open.add(s.pos);
  return open;
}

function isEligible(player) {
  const open = openBucketsAvailable();
  return open.has(posBucket(player.pos))
    && !state.pickedNames.has(player.name)
    && player.price <= maxAffordable();
}

function isCoachEligible(coach) {
  return !state.coach && coach && coach.price <= maxAffordableForCoach();
}

function teamRoster(year, code) {
  const season = SEASONS_CACHE.get(year);
  return season ? season.teams[code] : null;
}

function teamQualifies(year, code) {
  const team = teamRoster(year, code);
  if (!team) return false;
  return team.players.some(isEligible) || isCoachEligible(team.coach);
}

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function drawNew() {
  const attempt = (avoidLast) => {
    for (let tries = 0; tries < 300; tries++) {
      const s = rand(seasons);
      const season = SEASONS_CACHE.get(s.year);
      const codes = Object.keys(season.teams).filter(
        code => teamQualifies(s.year, code) && (!avoidLast || code !== state.lastCode)
      );
      if (codes.length) return { year: s.year, code: rand(codes) };
    }
    return null;
  };
  const draw = attempt(true) || attempt(false);
  if (draw) {
    state.draw = draw;
    state.lastCode = draw.code;
  }
  return draw;
}

function swapYear() {
  if (state.swapYearLeft <= 0 || !state.draw) return;
  const { code, year } = state.draw;
  const others = seasons.filter(s => s.year !== year && teamQualifies(s.year, code));
  if (!others.length) { toast("No other season works for this team right now."); return; }
  state.swapYearLeft--;
  const s = rand(others);
  state.draw = { year: s.year, code };
  render();
}

function swapTeam() {
  if (state.swapTeamLeft <= 0 || !state.draw) return;
  const { year, code } = state.draw;
  const season = SEASONS_CACHE.get(year);
  const others = Object.keys(season.teams).filter(c => c !== code && teamQualifies(year, c));
  if (!others.length) { toast("No other team works for this season right now."); return; }
  state.swapTeamLeft--;
  state.draw = { year, code: rand(others) };
  state.lastCode = state.draw.code;
  render();
}

function afterPick() {
  state.draw = null;
  if (filledCount() === 10 && state.coach) {
    render();
    return;
  }
  drawNew();
  render();
}

function pickPlayer(player) {
  if (!isEligible(player)) return;
  const bucket = posBucket(player.pos);
  // prefer an open starter slot of this bucket, else bench
  let slot = state.starters.find(s => !s.player && s.pos === bucket)
          || state.bench.find(s => !s.player && s.pos === bucket);
  if (!slot) return;
  slot.player = player;
  state.budget = Math.round((state.budget - player.price) * 10) / 10;
  state.pickedNames.add(player.name);
  afterPick();
}

function pickCoach(coach) {
  if (!isCoachEligible(coach)) return;
  state.coach = coach;
  state.budget = Math.round((state.budget - coach.price) * 10) / 10;
  afterPick();
}

function restart() {
  state = newState();
  drawNew();
  render();
}

// ---------------------------------------------------------------- render --

function $(id) { return document.getElementById(id); }

function slotHtml(slot) {
  const cls = "slot " + (slot.player ? "filled" : "empty");
  if (!slot.player) {
    return `<div class="${cls}">
      <div class="pos-tag ${slot.pos}">${slot.pos}</div>
      <div class="player-meta">open ${slot.pos === "G" ? "guard" : slot.pos === "F" ? "forward" : "center"}</div>
    </div>`;
  }
  const p = slot.player;
  return `<div class="${cls}">
    <div class="slot-head">
      ${faceHtml(p.name, p.code, null, 34)}
      <div class="pos-tag ${slot.pos}">${slot.pos}</div>
    </div>
    <div class="player-name">${esc(p.name)}</div>
    <div class="player-meta">${p.pts} pts &middot; ${p.reb} reb &middot; ${p.ast} ast &middot; OVR ${p.rating}</div>
  </div>`;
}

function coachSlotHtml() {
  const c = state.coach;
  if (!c) {
    return `<div class="slot empty coach-slot">
      <div class="pos-tag COACH">HC</div>
      <div class="player-meta">open — head coach</div>
    </div>`;
  }
  return `<div class="slot filled coach-slot">
    <div class="slot-head">
      ${coachFaceHtml(c.name, c.code, null, 34)}
      <div class="pos-tag COACH">HC</div>
    </div>
    <div class="player-name">${esc(c.name)}</div>
    <div class="player-meta">${c.wins}-${c.losses} &middot; ${signedNum(c.srsBonus)} SRS</div>
  </div>`;
}

function renderSlots() {
  $("starters").innerHTML = state.starters.map(slotHtml).join("");
  $("bench").innerHTML = state.bench.map(slotHtml).join("");
  $("coach-slot").innerHTML = coachSlotHtml();
}

function renderBudget() {
  if (typeof refreshTopbar === "function") refreshTopbar();
}

function awardBadgeHtml(p) {
  return p.awards ? `<span class="award-badge" title="${esc(p.awards)}">&#9733;</span>` : "";
}

function ratingTagHtml(p) {
  return p.ratingSource === "2k" ? `<span class="rating-2k-tag" title="Real NBA 2K rating">2K</span>` : "";
}

function pct(v) { return v == null ? "&mdash;" : Math.round(v * 100) + "%"; }

function statChipHtml(val, label) {
  return `<div class="pr-stat"><span class="pr-stat-val">${val}</span><span class="pr-stat-lbl">${label}</span></div>`;
}

function playerRowHtml(p, idx) {
  const eligible = isEligible(p);
  const bucket = posBucket(p.pos);
  return `<div class="player-row ${eligible ? "" : "ineligible"}" data-idx="${idx}">
    ${faceHtml(p.name, p.code, null, 40)}
    <div class="pr-id">
      <div class="pr-name">${esc(p.name)} ${awardBadgeHtml(p)}</div>
      <div class="pr-meta"><span class="pos-tag ${bucket}">${p.pos}</span> Age ${p.age ?? "&mdash;"} &middot; ${p.gp} GP &middot; ${p.min ?? "&mdash;"} MPG</div>
    </div>
    <div class="pr-stats">
      ${statChipHtml(p.pts, "PTS")}
      ${statChipHtml(p.reb, "REB")}
      ${statChipHtml(p.ast, "AST")}
      ${statChipHtml(p.stl ?? "&mdash;", "STL")}
      ${statChipHtml(p.blk ?? "&mdash;", "BLK")}
      ${statChipHtml(pct(p.fg3_pct), "3PT")}
    </div>
    <div class="pr-right">
      <div class="pr-ovr">${p.rating}${ratingTagHtml(p)}</div>
      <div class="price">€${p.price}M</div>
    </div>
  </div>`;
}

function coachRowHtml(coach) {
  const eligible = isCoachEligible(coach);
  const poText = (coach.playoff_wins || coach.playoff_losses)
    ? `${coach.playoff_wins}-${coach.playoff_losses} playoffs` : "missed the playoffs";
  return `<div class="player-row coach-row-in-draft ${eligible ? "" : "ineligible"}">
    ${coachFaceHtml(coach.name, coach.code, null, 40)}
    <div class="pr-id">
      <div class="pr-name">${esc(coach.name)} <span class="coach-tag">Head Coach</span></div>
      <div class="pr-meta">Career ${coach.career_wins}-${coach.career_losses} &middot; ${poText} this season</div>
    </div>
    <div class="pr-stats">
      ${statChipHtml(`${coach.wins}-${coach.losses}`, "RECORD")}
      ${statChipHtml(signedNum(coach.srsBonus), "SRS")}
    </div>
    <div class="pr-right">
      <div class="pr-ovr">&nbsp;</div>
      <div class="price">€${coach.price}M</div>
    </div>
  </div>`;
}

function dStatTile(value, label) {
  return `<div class="stat-tile"><div class="stat-tile-val">${value}</div><div class="stat-tile-label">${label}</div></div>`;
}

function avgOvrOf(slots) {
  return slots.reduce((s, x) => s + (x.player ? x.player.rating : 50), 0) / slots.length;
}

function renderSquadComplete() {
  const roster = allSlots().map(s => s.player);
  const totalPrice = (roster.reduce((sum, p) => sum + p.price, 0) + state.coach.price).toFixed(1);
  const teamRating = squadRating(state.starters, state.bench);
  const stats = squadStatLine(state.starters, state.bench);
  const chem = typeof chemistryBonus === "function"
    ? chemistryBonus(state.starters, state.bench, state.coach)
    : { bonus: 0, links: [] };
  const acc = typeof accoladesBonus === "function"
    ? accoladesBonus(state.starters, state.bench, state.coach)
    : { bonus: 0, badges: [] };

  $("squad-summary").innerHTML =
    `${roster.length} players + ${esc(state.coach.name)} as head coach &middot; €${totalPrice}M of €${BUDGET}M spent.`;

  $("squad-team-stats").innerHTML = [
    dStatTile(Math.round(teamRating), "Team OVR"),
    dStatTile(Math.round(avgOvrOf(state.starters)), "Starters OVR"),
    dStatTile(Math.round(avgOvrOf(state.bench)), "Bench OVR"),
    dStatTile(stats.pts.toFixed(1), "PTS"),
    dStatTile(stats.reb.toFixed(1), "REB"),
    dStatTile(stats.ast.toFixed(1), "AST"),
    dStatTile(stats.stl.toFixed(1), "STL"),
    dStatTile(stats.blk.toFixed(1), "BLK"),
    dStatTile(pct(stats.fg3_pct), "3PT%"),
    dStatTile(`+${chem.bonus.toFixed(1)}`, "Chemistry SRS"),
    dStatTile(`+${acc.bonus.toFixed(1)}`, "Accolades SRS"),
  ].join("");

  $("squad-split-note").textContent =
    `Weighted 75% starting five / 25% bench — the same split that drives your team's in-game strength (adjustable in the Team Hub's Game Plan).`;

  $("squad-accolades").classList.toggle("hidden", acc.badges.length === 0);
  $("squad-accolades-badges").innerHTML = acc.badges.map(b => `<div class="chem-link">
      <span class="chem-icon">&#127942;</span>
      <span>${esc(b.name)}</span>
      <span class="chem-team">${esc(b.label)}</span>
    </div>`).join("");

  $("squad-coach-line").innerHTML = state.coach ? `
    ${coachFaceHtml(state.coach.name, state.coach.code, null, 36)}
    <div><div class="pr-name">${esc(state.coach.name)}</div>
    <div class="pr-meta">${state.coach.wins}-${state.coach.losses} that season &middot; ${signedNum(state.coach.srsBonus)} SRS</div></div>` : "";
}

function renderDraw() {
  const empty = $("draw-empty"), card = $("draw-card"), done = $("squad-complete");
  if (filledCount() === 10 && state.coach) {
    empty.classList.add("hidden");
    card.classList.add("hidden");
    done.classList.remove("hidden");
    renderSquadComplete();
    return;
  }
  done.classList.add("hidden");

  if (!state.draw) {
    empty.classList.remove("hidden");
    card.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  card.classList.remove("hidden");

  const { year, code } = state.draw;
  const season = SEASONS_CACHE.get(year);
  const team = season.teams[code];
  $("draw-season").innerHTML = `${logoHtml(team.nba_id, team.name, team.colors, 20)} ${season.label} &bull; ${team.wins}-${team.losses}`;
  $("draw-team").textContent = team.name;
  $("swap-year-left").textContent = state.swapYearLeft;
  $("swap-team-left").textContent = state.swapTeamLeft;
  $("swap-year-btn").disabled = state.swapYearLeft <= 0;
  $("swap-team-btn").disabled = state.swapTeamLeft <= 0;

  const players = [...team.players].sort((a, b) => b.price - a.price);
  let rowsHtml = players.map((p, i) => playerRowHtml(p, i)).join("");
  if (team.coach) rowsHtml = coachRowHtml(team.coach) + rowsHtml;
  $("draw-players").innerHTML = rowsHtml;

  if (team.coach) {
    $("draw-players").querySelector(".coach-row-in-draft").addEventListener("click", () => pickCoach(team.coach));
  }
  $("draw-players").querySelectorAll(".player-row:not(.coach-row-in-draft)").forEach((row, i) => {
    row.addEventListener("click", () => pickPlayer(players[i]));
  });
}

function render() {
  renderSlots();
  renderBudget();
  renderDraw();
}

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2500);
}

// ------------------------------------------------------------------ boot --

function initDraft() {
  state = newState();
  $("draft-franchise-banner").innerHTML =
    `${logoHtml(FRANCHISE.nba_id, FRANCHISE.realName, FRANCHISE.colors, 26)}
     <span>Building the <strong>${esc(FRANCHISE.name)}</strong> — playing as the ${esc(FRANCHISE.realName)} franchise</span>`;
  $("draw-btn").addEventListener("click", () => { drawNew(); render(); });
  $("swap-year-btn").addEventListener("click", swapYear);
  $("swap-team-btn").addEventListener("click", swapTeam);
  $("restart-btn").addEventListener("click", restart);

  render();
}

/** Hand the completed draft off to the Team Hub. */
function getDraftedSquad() {
  return {
    starters: state.starters.map(s => ({ pos: s.pos, player: s.player })),
    bench: state.bench.map(s => ({ pos: s.pos, player: s.player })),
    coach: state.coach,
    budget: state.budget,
  };
}

function draftIsComplete() {
  return !!state && filledCount() === 10 && !!state.coach;
}
