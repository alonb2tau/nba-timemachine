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

async function fetchSeason(year) {
  if (SEASONS_CACHE.has(year)) return SEASONS_CACHE.get(year);
  const res = await fetch(`/api/seasons/${year}`);
  if (!res.ok) throw new Error(`GET /api/seasons/${year} -> ${res.status}`);
  const data = await res.json();
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
