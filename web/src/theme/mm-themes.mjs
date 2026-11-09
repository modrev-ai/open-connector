// TH-670: Open Connector's form of Mastermind's theme blocks. The console's shadcn tokens already use --accent and
// --muted for backgrounds, so the roles are written as --mm-<role>: the default theme's on a bare :root (themesCss's
// shape, theme-sync.mjs), then one :root[data-theme="<id>"] block per theme. styles/theme.css maps the console's
// tokens onto these under :root[data-theme], which public/theme-boot.js sets only when Mastermind opened the page.
import { themesCss } from "./theme-sync.mjs";

/** `css` with each role's custom property renamed `--mm-<role>` (only in declarations, never in comments). */
export function prefixRoles(css, roles) {
  const names = [...roles].sort((a, b) => b.length - a.length).map((r) => r.replace(/-/g, "\-"));
  return css.replace(new RegExp(String.raw`(^|[\s;{])--(${names.join("|")}):`, "gm"), "$1--mm-$2:");
}

/** The whole mm-themes.css, made from the themes the way every app's themes.css is, roles prefixed. */
export const mmThemesCss = (themes, roles, def) =>
  prefixRoles(themesCss(themes, roles, def), roles).replace("written by scripts/sync-themes.mjs from themes.mjs", "written by web/scripts/sync-themes.mjs from themes.mjs");
