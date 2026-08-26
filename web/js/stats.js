/*
 * stats.js — fire-and-forget gameplay telemetry. Every browser gets a
 * stable random id in localStorage (no accounts, no PII) — that's
 * `session_id`, "this browser." Every *game* gets its own fresh id from
 * startNewRun() — that's `run_id`, "this specific playthrough." The two
 * are deliberately different: without a separate run_id, starting a
 * second game in the same tab would silently overwrite the first game's
 * row (the backend merges on that id), and a page reload didn't need to
 * mean "new game," so localStorage was the wrong place for it. Every
 * send is wrapped so a failed or slow request never breaks gameplay —
 * telemetry is the last thing that should be able to crash a game in
 * progress.
 */
function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function statsSessionId() {
  let id = localStorage.getItem("nba_tm_session_id");
  if (!id) {
    id = newId();
    localStorage.setItem("nba_tm_session_id", id);
  }
  return id;
}

let currentRunId = null;

/** Call once at the start of each new game (difficulty picked) so every
 * checkpoint in that playthrough shares one row. */
function startNewRun() {
  currentRunId = newId();
  return currentRunId;
}

function getCurrentRunId() {
  return currentRunId;
}

function sendStatEvent(event, payload) {
  if (!currentRunId) startNewRun(); // defensive: a caller forgot to start a run explicitly
  try {
    fetch("/api/stats/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: currentRunId, session_id: statsSessionId(), event, ...payload }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) { /* telemetry must never break gameplay */ }
}
