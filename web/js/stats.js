/*
 * stats.js — fire-and-forget gameplay telemetry. Every browser gets a
 * random anonymous id in localStorage (no accounts, no PII) so the
 * /admin dashboard can answer real questions about how people actually
 * play. Every send is wrapped so a failed or slow request never breaks
 * gameplay — telemetry is the last thing that should be able to crash
 * a game in progress.
 */
function statsSessionId() {
  let id = localStorage.getItem("nba_tm_session_id");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("nba_tm_session_id", id);
  }
  return id;
}

function sendStatEvent(event, payload) {
  try {
    fetch("/api/stats/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: statsSessionId(), event, ...payload }),
      keepalive: true,
    }).catch(() => {});
  } catch (e) { /* telemetry must never break gameplay */ }
}
