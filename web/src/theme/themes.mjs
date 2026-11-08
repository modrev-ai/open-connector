// Copied from mastermind src/shared/themes.mjs by scripts/sync-themes.mjs (TH-670): Open Connector's copy of Mastermind's
// themes, the one source of the theme's roles. Edit Mastermind's file and run the sync; never edit this one.
/**
 * Mastermind's colour schemes (TH-38; Jong, 2026-10-26: "use different color scheme than light blue/purple. in the
 * setting, create option for appearance, and give 10 options"). Each theme is a complete set of ROLE tokens; every rule
 * in style.css reads the roles (or tokens derived from them in :root), so a theme swaps values in one place.
 *
 *   --bg         the window                    --text      body text          --accent    the primary accent (was cyan)
 *   --surface    panels, the chat, the dock    --muted     quiet text         --accent-2  the second accent, Here (was magenta)
 *   --surface-2  the bar, inputs, tooltips     --ok        healthy, on        --hot-text  text on a failure
 *   --raised     menus, tabs, cards            --warn      degraded, waiting
 *                                              --hot       down, failed
 *
 * style.css carries each theme as `:root[data-theme="<id>"], .theme-swatch[data-theme="<id>"] { ... }` (themeCss
 * below; test/themes.test.mjs checks the stylesheet's blocks are exactly these), and its bare :root holds the DEFAULT's
 * values, so a page with no data-theme still paints the default. The swatch selector gives Settings > Appearance its
 * previews from the same tokens, with no inline style (CSP style-src 'self').
 *
 * Every theme is dark and keeps these floors on bg, surface, surface-2 and raised (WCAG 2.x, contrast.mjs): text and
 * muted 4.5:1; the accents and the status colours 4.5:1 too, because they are also text (links, states) and the
 * background of a selected tab or button whose label is --bg.
 */

export const ROLES = Object.freeze(["bg", "surface", "surface-2", "raised", "text", "muted", "accent", "accent-2", "ok", "warn", "hot", "hot-text"]);

/** The default since TH-38: not cyan and magenta (Jong). Amber on warm black, teal as the second accent. */
export const DEFAULT_THEME = "ember";

export const THEMES = Object.freeze([
  { id: "ember", name: "Ember", note: "amber on warm black, teal second (the default)", tokens: { bg: "#0b0806", surface: "#120d09", "surface-2": "#17110c", raised: "#211810", text: "#f4e7d9", muted: "#b39a82", accent: "#ff9f43", "accent-2": "#3fd6c6", ok: "#7be495", warn: "#ffd166", hot: "#ff6b5b", "hot-text": "#ffc9c0" } },
  { id: "neon", name: "Neon", note: "cyan and magenta, Mastermind's first look", tokens: { bg: "#04050a", surface: "#04060e", "surface-2": "#060a16", raised: "#0b1222", text: "#cfe9ff", muted: "#7f93ad", accent: "#00e5ff", "accent-2": "#ff2bd6", ok: "#2bff9e", warn: "#ffb020", hot: "#ff4d5e", "hot-text": "#ffc2c8" } },
  { id: "matrix", name: "Matrix", note: "phosphor green on black, lime second", tokens: { bg: "#030803", surface: "#061006", "surface-2": "#081408", raised: "#0e1f0e", text: "#d4f7d4", muted: "#86b086", accent: "#39ff88", "accent-2": "#d4ff4a", ok: "#9cff6e", warn: "#ffd84a", hot: "#ff6e6e", "hot-text": "#ffc4c4" } },
  { id: "arctic", name: "Arctic", note: "ice blue on slate, lilac second", tokens: { bg: "#070a10", surface: "#0b1018", "surface-2": "#0e141e", raised: "#16202e", text: "#e6eef8", muted: "#93a3b8", accent: "#7cc4ff", "accent-2": "#c3b1ff", ok: "#7ee0b0", warn: "#ffd27a", hot: "#ff7a85", "hot-text": "#ffcbd0" } },
  { id: "synthwave", name: "Synthwave", note: "hot pink on violet night, sun yellow second", tokens: { bg: "#0d0716", surface: "#140b21", "surface-2": "#190e29", raised: "#24143a", text: "#f6e6ff", muted: "#b49ac8", accent: "#ff6ec7", "accent-2": "#ffd23f", ok: "#5ef2c0", warn: "#ffb347", hot: "#ff5c7a", "hot-text": "#ffc4d0" } },
  { id: "aurora", name: "Aurora", note: "sea green on deep blue, violet second", tokens: { bg: "#050b0d", surface: "#08121a", "surface-2": "#0a1620", raised: "#11222e", text: "#dff6f3", muted: "#8fb0ad", accent: "#5eead4", "accent-2": "#b9a2ff", ok: "#8af07a", warn: "#ffd166", hot: "#ff7b7b", "hot-text": "#ffc8c8" } },
  { id: "crimson", name: "Crimson", note: "signal red on black, gold second", tokens: { bg: "#0c0506", surface: "#14090a", "surface-2": "#190b0d", raised: "#261114", text: "#fbe4e4", muted: "#bf9a9a", accent: "#ff6161", "accent-2": "#ffc861", ok: "#7ddf9b", warn: "#ffb05c", hot: "#ff4f8b", "hot-text": "#ffc4d6" } },
  { id: "solar", name: "Solar", note: "sun yellow on umber, coral second", tokens: { bg: "#0b0903", surface: "#141006", "surface-2": "#191408", raised: "#251e0d", text: "#fbf3d9", muted: "#bfae84", accent: "#ffd23f", "accent-2": "#ff8a65", ok: "#a6e36f", warn: "#ffb84d", hot: "#ff6f61", "hot-text": "#ffcbc4" } },
  { id: "graphite", name: "Graphite", note: "silver on charcoal, soft blue second", tokens: { bg: "#0a0a0b", surface: "#111113", "surface-2": "#151517", raised: "#1f1f22", text: "#ececec", muted: "#a3a3a8", accent: "#dcdcdc", "accent-2": "#9ec5ff", ok: "#8fdc9b", warn: "#f2c46d", hot: "#ff7f7f", "hot-text": "#ffcccc" } },
  { id: "ocean", name: "Ocean", note: "azure on navy, aqua second", tokens: { bg: "#040912", surface: "#07101e", "surface-2": "#091426", raised: "#0f1f38", text: "#e2efff", muted: "#8ea6c4", accent: "#4db2ff", "accent-2": "#2ee6c5", ok: "#6fe39a", warn: "#ffcc5c", hot: "#ff6f7d", "hot-text": "#ffc7cd" } },
  // TH-340 (Jong, 2026-11-03: "add black/dark themes in the setting"; his answer: Black's accent pure white or light
  // grey, Dark's a soft neutral, the status colours stay coloured). Black is true #000 for OLED; Dark is a neutral grey
  // with no hue in any surface (R, G and B within 2).
  { id: "black", name: "Black", note: "white on true black (OLED), steel second", tokens: { bg: "#000000", surface: "#0a0a0a", "surface-2": "#101010", raised: "#181818", text: "#f2f2f2", muted: "#a3a3a3", accent: "#ffffff", "accent-2": "#b4c6dc", ok: "#7fd99a", warn: "#f5c76a", hot: "#ff7a7a", "hot-text": "#ffcaca" } },
  { id: "dark", name: "Dark", note: "soft grey on neutral dark grey, no tint", tokens: { bg: "#121212", surface: "#1a1a1a", "surface-2": "#202020", raised: "#2a2a2a", text: "#e8e8e8", muted: "#a8a8a8", accent: "#cfcfcf", "accent-2": "#a9bccc", ok: "#81c995", warn: "#fdd663", hot: "#f28b82", "hot-text": "#ffd0cb" } },
]);

/** The switch main appends to the renderer's argv (additionalArguments) with the stored theme; preload.cjs reads it. */
export const THEME_ARG = "--mm-theme=";

/** A theme by id; an unknown or missing id is the default (never no theme). */
export function themeOf(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME);
}

/** Whether `id` names a theme: what main's store accepts. */
export const isTheme = (id) => typeof id === "string" && THEMES.some((t) => t.id === id);

/**
 * Apps that follow Mastermind's theme, through `?theme=<id>` on their URL (agreed with the Task Hub builder, TH-38
 * follow-up): read before their first paint. A webview guest has no preload, so the page cannot postMessage it from
 * app://mastermind. TH-670 (Jong, 2026-11-09: "ensure all color theme matches across all apps and modules of brainet"):
 * the third-brain console and Financial Cortex follow too. Each app keeps a copy of this file, made by its own
 * `scripts/sync-themes.mjs` and held equal to it by a test, so this file is the one source of the roles' values.
 * TH-670 (rest): the utilities (VIDEO-TO-CODE, QR-STREAM, UNPACK, opened in the modal), OPEN CONNECTOR (MKB ›
 * Connectors) and the calendar app (CALENDAR's pane) follow too; the last two get it through apps.mjs guestPaneView.
 */
export const THEMED_APPS = Object.freeze(["task-hub", "financial-cortex", "third-brain", "video-to-code", "qr-stream", "unpack", "open-connector", "mm-calendar"]);

/**
 * TH-670: the themed apps whose open page switches with no reload. Mastermind runs `themeScript(id)` in the guest
 * (<webview>.executeJavaScript), which posts `{ type: THEME_MESSAGE, theme }` to the page's own window on its own
 * origin; the page's theme-boot.js sets data-theme from it. Any other themed app (Task Hub, whose background canvas
 * paints from the roles once) is reloaded with the new ?theme= instead.
 */
export const LIVE_THEMED_APPS = Object.freeze(["financial-cortex", "third-brain", "video-to-code", "qr-stream", "unpack", "open-connector", "mm-calendar"]);

/** The message a live themed page applies (the same type Mev's page takes, TH-366). */
export const THEME_MESSAGE = "mastermind:theme";

/** The script that hands an open page theme `id`, or null (nothing is run) when `id` is not one of THEMES. */
export function themeScript(id) {
  if (!isTheme(id)) return null;
  return `window.postMessage(${JSON.stringify({ type: THEME_MESSAGE, theme: id })}, location.origin)`;
}

/** `url` with its theme parameter set to theme `id` (the default for an unknown one). */
export function withTheme(url, id) {
  const u = new URL(url);
  u.searchParams.set("theme", themeOf(id).id);
  return u.href;
}

/** The theme's block in style.css, byte for byte (one line). */
export function themeCss(theme) {
  return `:root[data-theme="${theme.id}"], .theme-swatch[data-theme="${theme.id}"] { ${ROLES.map((r) => `--${r}: ${theme.tokens[r]};`).join(" ")} }`;
}

/** The pairs every theme must keep readable: [foreground role, background roles, floor]. */
export const CONTRAST_FLOORS = Object.freeze([
  ["text", ["bg", "surface", "surface-2", "raised"], 4.5],
  ["muted", ["bg", "surface", "surface-2", "raised"], 4.5],
  ["hot-text", ["bg", "surface", "surface-2", "raised"], 4.5],
  ["accent", ["bg", "surface", "surface-2", "raised"], 4.5],
  ["accent-2", ["bg", "surface", "surface-2", "raised"], 4.5],
  ["ok", ["bg", "surface", "surface-2", "raised"], 3],
  ["warn", ["bg", "surface", "surface-2", "raised"], 3],
  ["hot", ["bg", "surface", "surface-2", "raised"], 3],
]);
