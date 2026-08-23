/*
 * season.js — the 82-game regular season. No per-game summaries — games
 * resolve in bulk, silently, and the only thing you watch move is the
 * standings table. The only moment the season stops for you is the
 * All-Star break / trade deadline (collapsed into one checkpoint here),
 * where a couple of trade offers come in and you get one trip back to the
 * Team Hub to substitute or re-tune tactics before the stretch run.
 */

const SEASON_LENGTH = 82;
const CHECKPOINT_AT = 58; // roughly where the real All-Star break + trade deadline land in an 82-game slate

let SEASON = null;

function startSeason() {
  const aiLeague = drawAiLeague();
  SEASON = {
    aiLeague, yourConf: FRANCHISE.conf, yourDiv: FRANCHISE.div,
    schedule: buildUserSchedule(aiLeague, FRANCHISE.conf, FRANCHISE.div),
    gameIndex: 0, wins: 0, losses: 0,
    checkpointDone: false,
    checkpointOffers: null, checkpointOfferIdx: 0,
    pendingTrade: null,
    // season-highlight tracking for the end-of-run recap — cheap to keep
    // alongside the bulk sim loop, no box scores required
    curStreak: 0, curStreakKind: null, // "W" | "L"
    longestWinStreak: 0, longestLossStreak: 0,
    biggestWin: null, closestWin: null, // { margin, opponent }
  };
  renderSeason();
}

function simulateGamesBulk(count) {
  for (let i = 0; i < count && SEASON.gameIndex < SEASON.schedule.length; i++) {
    const opp = SEASON.schedule[SEASON.gameIndex];
    const eng = newGameEngine(HUB.starters, HUB.bench, HUB.tactics, opp, SEASON.gameIndex % 2 === 0, HUB.coach);
    let totals = eng.playInstant();
    while (totals.you === totals.opp) totals = eng.playOvertime(); // basketball has no ties — sim one more mini-period until it breaks
    const won = totals.you > totals.opp;
    const margin = Math.abs(totals.you - totals.opp);

    if (won) {
      SEASON.wins++;
      if (!SEASON.biggestWin || margin > SEASON.biggestWin.margin) SEASON.biggestWin = { margin, opponent: opp.name };
      if (!SEASON.closestWin || margin < SEASON.closestWin.margin) SEASON.closestWin = { margin, opponent: opp.name };
      SEASON.curStreak = SEASON.curStreakKind === "W" ? SEASON.curStreak + 1 : 1;
      SEASON.curStreakKind = "W";
      SEASON.longestWinStreak = Math.max(SEASON.longestWinStreak, SEASON.curStreak);
    } else {
      SEASON.losses++;
      SEASON.curStreak = SEASON.curStreakKind === "L" ? SEASON.curStreak + 1 : 1;
      SEASON.curStreakKind = "L";
      SEASON.longestLossStreak = Math.max(SEASON.longestLossStreak, SEASON.curStreak);
    }
    SEASON.gameIndex++;
  }
}

function simulateToCheckpoint() {
  simulateGamesBulk(CHECKPOINT_AT - SEASON.gameIndex);
  SEASON.checkpointDone = true;
  triggerCheckpoint();
}

function simulateRestOfSeason() {
  simulateGamesBulk(SEASON.schedule.length - SEASON.gameIndex);
  renderSeason();
  startPlayoffs();
}

// ------------------------------------------------------------ checkpoint --

function triggerCheckpoint() {
  const offers = [makeTradeOffer(), makeTradeOffer()].filter(Boolean);
  SEASON.checkpointOffers = offers;
  SEASON.checkpointOfferIdx = 0;
  showNextCheckpointOffer();
}

function showNextCheckpointOffer() {
  if (SEASON.checkpointOfferIdx < SEASON.checkpointOffers.length) {
    showTradeOffer(SEASON.checkpointOffers[SEASON.checkpointOfferIdx]);
  } else {
    enterCheckpointHub();
  }
}

function enterCheckpointHub() {
  sendStatEvent("season_checkpoint", { games_played: SEASON.gameIndex, wins: SEASON.wins, losses: SEASON.losses });
  SEASON.checkpointOffers = null;
  $("hub-checkpoint-sub").textContent =
    `${SEASON.gameIndex} of ${SEASON_LENGTH} games played — record ${SEASON.wins}-${SEASON.losses}. ` +
    `This is your only chance to make changes before the playoffs.`;
  $("hub-checkpoint-banner").classList.remove("hidden");
  $("start-season-btn").dataset.mode = "resume";
  renderHub();
  switchPhase("hub");
}

// ------------------------------------------------------------------ trades --

function makeTradeOffer() {
  const benchWithPlayers = HUB.bench.map((s, i) => ({ s, i })).filter(x => x.s.player);
  if (!benchWithPlayers.length) return null;
  const target = rand(benchWithPlayers);
  const bucket = target.s.pos;

  for (let tries = 0; tries < 60; tries++) {
    const s = rand(seasons);
    const season = SEASONS_CACHE.get(s.year);
    const code = rand(Object.keys(season.teams));
    const pool = season.teams[code].players.filter(p => posBucket(p.pos) === bucket);
    if (!pool.length) continue;
    const candidate = rand(pool);
    if (Math.abs(candidate.price - target.s.player.price) > 4) continue;
    return { outSlotIdx: target.i, outgoing: target.s.player, incoming: candidate, fromTeam: season.teams[code].name, fromYear: season.label };
  }
  return null;
}

function showTradeOffer(offer) {
  SEASON.pendingTrade = offer;
  $("trade-incoming").innerHTML = `
    <div class="trade-player-head">${faceHtml(offer.incoming.name, offer.incoming.code, null, 40)}<div class="name">${esc(offer.incoming.name)}</div></div>
    <div class="line">${offer.incoming.pos} &middot; ${offer.incoming.pts} pts &middot; OVR ${offer.incoming.rating} &middot; €${offer.incoming.price}M</div>
    <div class="line">${esc(offer.fromTeam)} &middot; ${offer.fromYear}</div>`;
  $("trade-outgoing").innerHTML = `
    <div class="trade-player-head">${faceHtml(offer.outgoing.name, offer.outgoing.code, null, 40)}<div class="name">${esc(offer.outgoing.name)}</div></div>
    <div class="line">${offer.outgoing.pos} &middot; ${offer.outgoing.pts} pts &middot; OVR ${offer.outgoing.rating}</div>`;
  $("trade-modal").classList.remove("hidden");
}

function resolveTrade(accept) {
  const offer = SEASON.pendingTrade;
  if (accept && offer) {
    HUB.bench[offer.outSlotIdx].player = offer.incoming;
    toast(`Trade made: ${offer.incoming.name} in, ${offer.outgoing.name} out.`);
  }
  SEASON.pendingTrade = null;
  $("trade-modal").classList.add("hidden");
  if (typeof renderHub === "function" && HUB) renderHub();

  if (SEASON.checkpointOffers) {
    SEASON.checkpointOfferIdx++;
    showNextCheckpointOffer();
  } else {
    renderSeason();
  }
}

function offerOneTrade() {
  const offer = makeTradeOffer();
  if (offer) showTradeOffer(offer);
  else toast("No trade offers on the table right now.");
}

// ---------------------------------------------------------------- render --

function standingsRowHtml(r, rank) {
  return `<tr class="${r.isYou ? "you" : ""}">
    <td>${rank}</td>
    <td class="team-cell">${logoHtml(r.nba_id, r.name, r.colors, 20)} ${esc(r.name)}</td>
    <td>${r.wins}</td><td>${r.losses}</td>
    <td>${(r.wins / Math.max(1, r.wins + r.losses) * 100).toFixed(1)}%</td>
  </tr>`;
}

function renderStandings() {
  const you = { conf: SEASON.yourConf, wins: SEASON.wins, losses: SEASON.losses, srs: teamStrength(HUB.starters, HUB.bench, HUB.tactics, HUB.coach) };
  const east = conferenceStandings(SEASON.aiLeague, "East", SEASON.gameIndex, you);
  const west = conferenceStandings(SEASON.aiLeague, "West", SEASON.gameIndex, you);
  $("standings-east").innerHTML = east.map((r, i) => standingsRowHtml(r, i + 1)).join("");
  $("standings-west").innerHTML = west.map((r, i) => standingsRowHtml(r, i + 1)).join("");
}

function renderSeason() {
  renderStandings();
  const btn = $("sim-season-btn");
  const done = SEASON.gameIndex >= SEASON.schedule.length;
  if (done) {
    btn.classList.add("hidden");
  } else if (!SEASON.checkpointDone) {
    btn.classList.remove("hidden");
    btn.textContent = "Simulate to All-Star Break";
    btn.onclick = simulateToCheckpoint;
  } else {
    btn.classList.remove("hidden");
    btn.textContent = "Simulate Rest of Regular Season";
    btn.onclick = simulateRestOfSeason;
  }
  $("season-progress").textContent =
    `${SEASON.gameIndex} of ${SEASON_LENGTH} games played — record ${SEASON.wins}-${SEASON.losses}` +
    (done ? " — regular season complete." : "");
  if (typeof refreshTopbar === "function") refreshTopbar();
}

function wireSeasonEvents() {
  $("trade-accept-btn").addEventListener("click", () => resolveTrade(true));
  $("trade-decline-btn").addEventListener("click", () => resolveTrade(false));
}
