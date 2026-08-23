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

/** The draft already leans on randomness as its core mechanic (random
 * season/team draws) — offering a random franchise pick here is an
 * easy, on-brand way to shortcut the 30-card wall for anyone undecided. */
function surpriseFranchise() {
  const opts = franchiseOptions();
  if (!opts.length) return;
  selectFranchise(rand(opts).code);
}

function renderFranchisePicker() {
  const opts = franchiseOptions();
  $("franchise-grid").innerHTML = opts.map(franchiseCardHtml).join("");
  $("franchise-grid").querySelectorAll(".franchise-card").forEach(el => {
    bindActivate(el, () => selectFranchise(el.dataset.code));
  });

  const selected = opts.find(o => o.code === franchiseSelectedCode);
  const nameFilled = $("franchise-name-input").value.trim().length > 0;
  $("franchise-confirm-btn").disabled = !selected || !nameFilled;
  $("franchise-confirm-hint").textContent = !selected && !nameFilled
    ? "Pick a team and name it to continue."
    : !selected ? "Pick a team to continue."
    : !nameFilled ? "Name your team to continue."
    : "";

  const preview = $("franchise-selected-preview");
  if (selected) {
    preview.classList.remove("hidden");
    preview.innerHTML = `${logoHtml(selected.nba_id, selected.name, selected.colors, 28)}
      Playing as the <strong>${esc(selected.name)}</strong> franchise &middot; ${selected.conf} Conference, ${selected.div} Division`;
  } else {
    preview.classList.add("hidden");
  }
}

function franchiseLoadError(msg, retry) {
  $("franchise-grid").innerHTML = `<div class="load-error">
    <p>${esc(msg)}</p>
    <button id="franchise-retry-btn" class="btn primary small">Try again</button>
  </div>`;
  $("franchise-retry-btn").addEventListener("click", retry);
}

async function initFranchise() {
  $("franchise-grid").innerHTML = `<div class="load-spinner" role="status">Loading franchises&hellip;</div>`;
  let list;
  try {
    list = await fetchSeasonList();
  } catch (e) {
    franchiseLoadError("Couldn't reach the server for season data. Check your connection and try again.", initFranchise);
    return;
  }
  seasons = list;
  if (!seasons.length) {
    franchiseLoadError("No season data yet — the scraper is still running.", initFranchise);
    return;
  }
  try {
    await preloadAllSeasons(seasons);
  } catch (e) {
    franchiseLoadError("Season data failed to load. Check your connection and try again.", initFranchise);
    return;
  }
  seasons = seasons.filter(s => SEASONS_CACHE.has(s.year)); // drop any that failed — the rest of the app only ever reads from the cache anyway
  buildHistoryIndexes();

  renderFranchisePicker();
  $("franchise-name-input").addEventListener("input", renderFranchisePicker);
  $("franchise-confirm-btn").addEventListener("click", confirmFranchise);
  $("franchise-surprise-btn").addEventListener("click", surpriseFranchise);
}
