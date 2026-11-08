// TH-670: Open Connector's theme when Mastermind shows it, before the first paint and every pick after it. Mastermind
// opens this console at ?theme=<id> (MKB > Connectors; themes.mjs THEMED_APPS) and, when Jong picks another theme in
// Appearance, posts { type: "mastermind:theme", theme } to this window on its own origin (LIVE_THEMED_APPS,
// themeScript), so the open page switches with no reload. Then data-theme is set (styles/theme.css maps the console's
// tokens onto Mastermind's roles under it) and the page is dark (theme.ts no longer follows the OS); the id is kept for
// this tab only (sessionStorage), so a reload inside Mastermind's pane, which drops the query, keeps it. Opened anywhere
// else, with no ?theme= and nothing kept, nothing is set and the console keeps its own light, dark or auto. A classic
// script in <head>; it can't import themes.mjs, so it carries the ids, which web/scripts/sync-themes.mjs writes.
(function () {
  var IDS = ["ember", "neon", "matrix", "arctic", "synthwave", "aurora", "crimson", "solar", "graphite", "ocean", "black", "dark"];
  var DEFAULT_THEME = "ember";
  var MESSAGE = "mastermind:theme";
  var KEY = "mastermind.theme";
  var root = document.documentElement;
  function apply(id) {
    root.setAttribute("data-theme", id);
    root.classList.add("dark");
    try {
      sessionStorage.setItem(KEY, id);
    } catch (e) {}
  }
  var id = null;
  try {
    id = new URLSearchParams(location.search).get("theme");
  } catch (e) {
    id = null;
  }
  if (id !== null) apply(IDS.indexOf(id) >= 0 ? id : DEFAULT_THEME);
  else {
    var kept = null;
    try {
      kept = sessionStorage.getItem(KEY);
    } catch (e) {
      kept = null;
    }
    if (IDS.indexOf(kept) >= 0) apply(kept);
  }
  window.addEventListener("message", function (e) {
    if (e.source !== window || e.origin !== location.origin) return;
    var d = e.data;
    if (!d || d.type !== MESSAGE || typeof d.theme !== "string" || IDS.indexOf(d.theme) < 0) return;
    apply(d.theme);
  });
})();
