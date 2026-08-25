/*
 * data.js — everything that talks to the server.
 *
 * If you're new to JS: `fetch(url)` sends an HTTP request and returns a
 * Promise — a placeholder for a value that isn't ready yet. `await` pauses
 * this function (not the whole page) until that promise resolves. A
 * function that uses `await` must be declared `async`.
 */

const SEASONS_CACHE = new Map(); // year -> season JSON, so we only fetch each one once
let seasons = []; // [{year, label}] — populated once by initFranchise(), read everywhere after

async function fetchSeasonList() {
  const res = await fetch("/api/seasons");
  if (!res.ok) throw new Error(`GET /api/seasons -> ${res.status}`);
  return res.json(); // [{year, label}, ...]
}

// Every player's price, driven purely by their 0-99 overall rating and
// nothing else (era, position, real-life salary — none of it factors in),
// spread smoothly across the game's full €1M-€26M draft-budget range. A
// mild convex curve (rating^1.4) means it isn't a flat straight line —
// elite ratings cost disproportionately more, the same "superstar tax"
// feel real cap economics have — while a replacement-level guy still
// costs next to nothing. Applied once, right after fetch, so every
// consumer (draft board, franchise picker, trade offers) sees one
// consistent price no matter where the raw rating came from.
// The 20-99 number quoted elsewhere is the *scale*'s theoretical bounds,
// not what real players actually hit — the scraped pool's real ratings
// only ever run about 38-99 (nobody in 16 real seasons rates as a 20).
// Anchoring the price curve to the theoretical floor made the *median*
// real player price out around €14.5M — half the league too expensive to
// field a full roster on any budget. Anchored to the real observed floor
// instead, so a genuinely bottom-of-the-roster player prices near €1M.
const PRICE_MIN = 1, PRICE_MAX = 26;
const RATING_MIN = 38, RATING_MAX = 99;
function priceFromRating(rating) {
  const t = Math.max(0, Math.min(1, (rating - RATING_MIN) / (RATING_MAX - RATING_MIN)));
  const price = PRICE_MIN + (PRICE_MAX - PRICE_MIN) * Math.pow(t, 1.4);
  return Math.round(price * 2) / 2; // nearest €0.5M
}

function repriceSeason(seasonData) {
  for (const code in seasonData.teams) {
    for (const p of seasonData.teams[code].players) p.price = priceFromRating(p.rating);
  }
  return seasonData;
}

async function fetchSeason(year) {
  if (SEASONS_CACHE.has(year)) return SEASONS_CACHE.get(year);
  const res = await fetch(`/api/seasons/${year}`);
  if (!res.ok) throw new Error(`GET /api/seasons/${year} -> ${res.status}`);
  const data = repriceSeason(await res.json());
  SEASONS_CACHE.set(year, data);
  return data;
}

/**
 * Load every season up front so drawNew() can pick randomly with no network
 * wait. One bad season shouldn't take down the ones that loaded fine —
 * Promise.allSettled means a single flaky fetch degrades the pool of
 * available seasons instead of aborting the whole preload. Only throws (so
 * the caller can show a real error) if literally nothing came through.
 */
async function preloadAllSeasons(seasonList) {
  const results = await Promise.allSettled(seasonList.map(s => fetchSeason(s.year)));
  const failed = results.filter(r => r.status === "rejected");
  if (failed.length) {
    console.warn(`${failed.length}/${seasonList.length} seasons failed to load`, failed.map(r => r.reason));
  }
  if (failed.length === seasonList.length) {
    throw new Error("Every season failed to load");
  }
}
