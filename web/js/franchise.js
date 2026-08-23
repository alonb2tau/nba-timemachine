/*
 * franchise.js — the very first decision: which real NBA franchise you're
 * taking over for this run, and what you're calling your team. The chosen
 * franchise's real conference, division, colors and logo carry through
 * every other phase — the league itself is built around this choice (see
 * league.js's drawAiLeague(), which draws the other 29 real franchises
 * around whichever one you didn't pick).
 */

let FRANCHISE = null; // { code, name (custom), realName, colors, nba_id, conf, div }
let franchiseSelectedCode = null;

function franchiseOptions() {
  const latestYear = Math.max(...seasons.map(s => s.year));
  const teams = SEASONS_CACHE.get(latestYear).teams;
  return Object.entries(teams)
    .map(([code, t]) => ({ code, name: t.name, colors: t.colors, nba_id: t.nba_id, conf: t.conf, div: t.div }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function selectFranchise(code) {
  franchiseSelectedCode = code;
  renderFranchisePicker();
}

function confirmFranchise() {
  const selected = franchiseOptions().find(o => o.code === franchiseSelectedCode);
  if (!selected) return;
  const name = $("franchise-name-input").value.trim() || selected.name;
  FRANCHISE = {
    code: selected.code, name, realName: selected.name,
    colors: selected.colors, nba_id: selected.nba_id, conf: selected.conf, div: selected.div,
  };
  sendStatEvent("franchise_picked", { franchise_code: FRANCHISE.code, franchise_name: FRANCHISE.name });
  initDraft();
  switchPhase("draft");
}

function franchiseCardHtml(o) {
  const selected = franchiseSelectedCode === o.code;
  return `<div class="franchise-card ${selected ? "selected" : ""}" data-code="${o.code}">
    ${logoHtml(o.nba_id, o.name, o.colors, 40)}
    <div class="franchise-card-name">${esc(o.name)}</div>
    <div class="franchise-card-meta">${o.conf} &middot; ${o.div}</div>
  </div>`;
}

function renderFranchisePicker() {
  const opts = franchiseOptions();
  $("franchise-grid").innerHTML = opts.map(franchiseCardHtml).join("");
  $("franchise-grid").querySelectorAll(".franchise-card").forEach(el => {
    el.addEventListener("click", () => selectFranchise(el.dataset.code));
  });

  const selected = opts.find(o => o.code === franchiseSelectedCode);
  const nameFilled = $("franchise-name-input").value.trim().length > 0;
  $("franchise-confirm-btn").disabled = !selected || !nameFilled;

  const preview = $("franchise-selected-preview");
  if (selected) {
    preview.classList.remove("hidden");
    preview.innerHTML = `${logoHtml(selected.nba_id, selected.name, selected.colors, 28)}
      Playing as the <strong>${esc(selected.name)}</strong> franchise &middot; ${selected.conf} Conference, ${selected.div} Division`;
  } else {
    preview.classList.add("hidden");
  }
}

async function initFranchise() {
  seasons = await fetchSeasonList();
  if (!seasons.length) {
    $("franchise-grid").innerHTML = "<p>No season data yet — the scraper is still running. Reload in a bit.</p>";
    return;
  }
  await preloadAllSeasons(seasons);
  buildHistoryIndexes();

  renderFranchisePicker();
  $("franchise-name-input").addEventListener("input", renderFranchisePicker);
  $("franchise-confirm-btn").addEventListener("click", confirmFranchise);
}
