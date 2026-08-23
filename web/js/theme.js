/*
 * theme.js — the light/dark toggle button. The actual attribute-setting
 * happens inline in index.html's <head>, before this file even loads, so
 * there's no flash of the wrong theme on first paint; this file only
 * wires the button and keeps its icon in sync with the current theme.
 */
function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("nba_tm_theme", theme);
  const btn = document.getElementById("theme-toggle-btn");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

function wireThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  btn.textContent = currentTheme() === "dark" ? "☀️" : "🌙";
  btn.addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark"));
}

wireThemeToggle();
