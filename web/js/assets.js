/*
 * assets.js — real photos and logos, with a graceful fallback.
 *
 * Basketball-Reference's headshot URLs have a version-number path segment
 * that turns out to be ignored server-side — any value works — so we can
 * build a photo URL for any player/coach directly from the "code" already
 * sitting in our scraped data, with zero extra network requests. Coverage
 * isn't total (obscure historical role players often have no photo at
 * all), so every <img> here carries an onerror that swaps to a generated
 * initials avatar instead of showing a broken image.
 */

const ASSET_VER = "202401010"; // any digits work; BBRef doesn't validate this segment

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function playerPhotoUrl(code) {
  return `https://www.basketball-reference.com/req/${ASSET_VER}/images/headshots/${code}.jpg`;
}
function coachPhotoUrl(code) {
  return `https://www.basketball-reference.com/req/${ASSET_VER}/images/headshots/${code}.png`;
}
function teamLogoUrl(nbaId) {
  return `https://cdn.nba.com/logos/nba/${nbaId}/global/L/logo.svg`;
}

function initialsOf(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

/** A round photo with an initials-avatar fallback. size in px. */
function faceHtml(name, code, colors, size) {
  size = size || 40;
  const bg = (colors && colors[0]) || "#4c5158";
  const url = code ? playerPhotoUrl(code) : null;
  const fallback = `<div class="face-fallback" style="display:${url ? "none" : "flex"};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:${esc(bg)};">${esc(initialsOf(name))}</div>`;
  const img = url
    ? `<img src="${esc(url)}" alt="" class="face-img" style="width:${size}px;height:${size}px;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
    : "";
  return `<span class="face-wrap" style="width:${size}px;height:${size}px;">${img}${fallback}</span>`;
}

function coachFaceHtml(name, code, colors, size) {
  size = size || 40;
  const bg = (colors && colors[0]) || "#4c5158";
  const url = code ? coachPhotoUrl(code) : null;
  const fallback = `<div class="face-fallback" style="display:${url ? "none" : "flex"};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:${esc(bg)};">${esc(initialsOf(name))}</div>`;
  const img = url
    ? `<img src="${esc(url)}" alt="" class="face-img" style="width:${size}px;height:${size}px;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
    : "";
  return `<span class="face-wrap" style="width:${size}px;height:${size}px;">${img}${fallback}</span>`;
}

/** A team logo with a colored-dot fallback (some old/rare franchise ids may not resolve). */
function logoHtml(nbaId, name, colors, size) {
  size = size || 24;
  const bg = (colors && colors[0]) || "#4c5158";
  const fallback = `<span class="logo-fallback" style="display:none;width:${size}px;height:${size}px;background:${esc(bg)};"></span>`;
  const img = nbaId
    ? `<img src="${esc(teamLogoUrl(nbaId))}" alt="${esc(name)} logo" class="team-logo" style="width:${size}px;height:${size}px;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block';">`
    : "";
  return `<span class="logo-wrap" style="width:${size}px;height:${size}px;">${img}${fallback}</span>`;
}

const TROPHY_SVG = `<svg viewBox="0 0 64 64" class="trophy-svg" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 8h24v4c0 9-4 15-12 15s-12-6-12-15V8z" fill="url(#trophyGrad)"/>
  <path d="M20 10h-8c0 8 3 13 9 14" fill="none" stroke="url(#trophyGrad)" stroke-width="3" stroke-linecap="round"/>
  <path d="M44 10h8c0 8-3 13-9 14" fill="none" stroke="url(#trophyGrad)" stroke-width="3" stroke-linecap="round"/>
  <rect x="29" y="26" width="6" height="10" fill="url(#trophyGrad)"/>
  <path d="M18 44c0-4 6-6 14-6s14 2 14 6v3H18v-3z" fill="url(#trophyGrad)"/>
  <rect x="24" y="47" width="16" height="4" rx="1" fill="url(#trophyGrad)"/>
  <defs>
    <linearGradient id="trophyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f3d78a"/>
      <stop offset="55%" stop-color="#c9a227"/>
      <stop offset="100%" stop-color="#8f6f14"/>
    </linearGradient>
  </defs>
</svg>`;

/** "+1.4" or "-0.9" — never a double sign for a negative value. */
function signedNum(n, decimals) {
  decimals = decimals ?? 1;
  const v = Number(n).toFixed(decimals);
  return n >= 0 ? `+${v}` : v;
}
