/*
 * hub.js — the Team Hub: view your roster, substitute players between
 * starters and bench, and set the game plan (tactics) that feeds sim.js
 * during the season. The coach was hired during the draft and is locked
 * in for the season — real NBA teams don't fire a coach mid-year in this
 * game — so this screen shows the coach read-only.
 */

let HUB = null; // { starters, bench, budget, coach, tactics, subMode, subSelection }

function initHub(draftedSquad) {
  HUB = {
    starters: draftedSquad.starters,
    bench: draftedSquad.bench,
    budget: draftedSquad.budget,
    coach: draftedSquad.coach,
    tactics: { pace: "balanced", shots: "balanced", scheme: "solid", offense: "balanced", boards: "balanced", rotation: "balanced" },
    subMode: false,
    subSelection: null, // { list: "starters"|"bench", idx }
  };
  wireHubEvents();
  renderHub();
}

function hubAllSlots() { return HUB.starters.concat(HUB.bench); }

function toggleSubMode() {
  HUB.subMode = !HUB.subMode;
  HUB.subSelection = null;
  renderHub();
}

function selectForSub(list, idx) {
  const slot = HUB[list][idx];
  if (!slot.player) return;

  if (!HUB.subSelection) {
    HUB.subSelection = { list, idx };
    renderHub();
    return;
  }
  const a = HUB.subSelection;
  if (a.list === list && a.idx === idx) { // clicked the same slot again
    HUB.subSelection = null;
    renderHub();
    return;
  }
  const slotA = HUB[a.list][a.idx];
  const slotB = HUB[list][idx];
  if (slotA.pos !== slotB.pos) {
    toast(`${slotA.pos} and ${slotB.pos} can't swap — different positions.`);
    HUB.subSelection = { list, idx };
    renderHub();
    return;
  }
  const tmp = slotA.player;
  slotA.player = slotB.player;
  slotB.player = tmp;
  HUB.subSelection = null;
  renderHub();
}

function setTactic(key, val) {
  HUB.tactics[key] = val;
  renderHub();
}

// ---------------------------------------------------------------- render --

function hubSlotHtml(slot, list, idx) {
  const filled = !!slot.player;
  const selected = HUB.subSelection && HUB.subSelection.list === list && HUB.subSelection.idx === idx;
  const cls = ["hub-slot", filled ? "filled" : "empty", HUB.subMode && filled ? "selectable" : "", selected ? "selected" : ""]
    .filter(Boolean).join(" ");
  if (!filled) {
    return `<div class="${cls}"><div class="pos-tag ${slot.pos}">${slot.pos}</div><div class="player-meta">empty</div></div>`;
  }
  const p = slot.player;
  return `<div class="${cls}" data-list="${list}" data-idx="${idx}">
    <div class="slot-head">${faceHtml(p.name, p.code, null, 34)}<div class="pos-tag ${slot.pos}">${slot.pos}</div></div>
    <div class="player-name">${esc(p.name)}</div>
    <div class="player-meta">${p.pts} pts &middot; ${p.reb} reb &middot; ${p.ast} ast &middot; OVR ${p.rating}</div>
  </div>`;
}

function renderHub() {
  $("hub-starters").innerHTML = HUB.starters.map((s, i) => hubSlotHtml(s, "starters", i)).join("");
  $("hub-bench").innerHTML = HUB.bench.map((s, i) => hubSlotHtml(s, "bench", i)).join("");

  if (HUB.subMode) {
    $("hub-starters").querySelectorAll(".hub-slot.selectable").forEach(el =>
      el.addEventListener("click", () => selectForSub(el.dataset.list, Number(el.dataset.idx))));
    $("hub-bench").querySelectorAll(".hub-slot.selectable").forEach(el =>
      el.addEventListener("click", () => selectForSub(el.dataset.list, Number(el.dataset.idx))));
  }

  $("sub-mode-btn").textContent = HUB.subMode ? "Done substituting" : "Substitute";
  $("sub-hint").classList.toggle("hidden", !HUB.subMode);

  for (const key of ["pace", "shots", "scheme", "offense", "boards", "rotation"]) {
    const group = document.querySelector(`.tactic-group[data-key="${key}"]`);
    group.querySelectorAll("button").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.val === HUB.tactics[key]);
    });
  }

  const c = HUB.coach;
  $("hub-coach-card").innerHTML = c ? `
    ${coachFaceHtml(c.name, c.code, null, 46)}
    <div>
      <div class="hub-coach-name">${esc(c.name)}</div>
      <div class="hub-coach-meta">${c.wins}-${c.losses} that season &middot; ${signedNum(c.srsBonus)} SRS &middot; €${c.price}M</div>
    </div>` : "";

  $("hub-budget-val").textContent = `€${HUB.budget.toFixed(1)}M`;

  const avgOvr = squadRating(HUB.starters, HUB.bench, HUB.tactics.rotation);
  const chem = chemistryBonus(HUB.starters, HUB.bench, HUB.coach);
  const acc = accoladesBonus(HUB.starters, HUB.bench, HUB.coach, HUB.tactics.rotation);
  $("team-rating-val").textContent = Math.round(avgOvr);
  $("team-strength-val").textContent = signedNum(teamStrength(HUB.starters, HUB.bench, HUB.tactics, HUB.coach));
  $("chem-bonus-val").textContent = `+${chem.bonus.toFixed(1)} SRS`;
  $("hub-chemistry-links").innerHTML = chem.links.length
    ? chem.links.map(l => `<div class="chem-link">
        <span class="chem-icon">${l.kind === "coach" ? "&#127978;" : "&#8644;"}</span>
        <span>${esc(l.a)} &amp; ${esc(l.b)}</span>
        <span class="chem-team">${esc(l.teamName)} &middot; ${l.label}</span>
      </div>`).join("")
    : `<div class="chem-empty">No real history on this roster yet — picks who were actual teammates (or coached each other) add chemistry.</div>`;

  $("acc-bonus-val").textContent = `+${acc.bonus.toFixed(1)} SRS`;
  $("hub-accolades-badges").innerHTML = acc.badges.length
    ? acc.badges.map(b => `<div class="chem-link">
        <span class="chem-icon">&#127942;</span>
        <span>${esc(b.name)}</span>
        <span class="chem-team">${esc(b.label)}</span>
      </div>`).join("")
    : `<div class="chem-empty">No real awards or league-leader seasons on this roster yet.</div>`;

  const startBtn = $("start-season-btn");
  startBtn.textContent = startBtn.dataset.mode === "resume" ? "Resume Season" : "Start Season";

  if (typeof refreshTopbar === "function") refreshTopbar();
}

function wireHubEvents() {
  $("sub-mode-btn").addEventListener("click", toggleSubMode);
  document.querySelectorAll(".tactic-group").forEach(group => {
    const key = group.dataset.key;
    group.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => setTactic(key, btn.dataset.val));
    });
  });
}
