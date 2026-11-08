#!/usr/bin/env node
// TH-670: Open Connector's copy of Mastermind's themes, remade from the source (src/theme/theme-sync.mjs says why).
//
//   node web/scripts/sync-themes.mjs [--from <mastermind checkout>]   (default: MASTERMIND_DIR, else ../mastermind, else C:/Workstation/mastermind)
//   node web/scripts/sync-themes.mjs --check                          exit 1 when the copy differs, writing nothing
//
// Writes web/src/theme/themes.mjs (the copy), web/src/theme/mm-themes.css and web/public/theme-boot.js's ids. The
// console's own tokens already use some role names for other things (shadcn's --accent and --muted are backgrounds),
// so here every role is written as --mm-<role> (mmThemesCss), and styles/theme.css maps the console's tokens onto them.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyOf, mastermindThemesPath, themesDrift, withBootIds } from "../src/theme/theme-sync.mjs";
import { mmThemesCss } from "../src/theme/mm-themes.mjs";

const APP_NAME = "Open Connector";
const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(WEB, "..");
const THEME = join(WEB, "src/theme");
const BOOT = join(WEB, "public/theme-boot.js");
const i = process.argv.indexOf("--from");
const from = i === -1 ? null : process.argv[i + 1];
const src = mastermindThemesPath(from ? { MASTERMIND_DIR: from } : process.env, [resolve(REPO, "..", "mastermind"), "C:/Workstation/mastermind"], existsSync, join);
if (!src) {
  console.error("sync-themes: no Mastermind checkout found (pass --from <dir> or set MASTERMIND_DIR)");
  process.exit(2);
}
const mine = join(THEME, "themes.mjs");
const source = readFileSync(src, "utf8");
const drift = existsSync(mine) ? themesDrift(readFileSync(mine, "utf8"), source, APP_NAME) : "no copy yet";
if (process.argv.includes("--check")) {
  console.log(drift ? `sync-themes: ${APP_NAME}'s copy differs from ${src}: ${drift}` : `sync-themes: ${APP_NAME}'s copy is ${src}, byte for byte`);
  process.exit(drift ? 1 : 0);
}
writeFileSync(mine, copyOf(source, APP_NAME));
const { THEMES, ROLES, DEFAULT_THEME, themeOf } = await import(`${pathToFileURL(mine).href}?t=${Date.now()}`);
writeFileSync(join(THEME, "mm-themes.css"), mmThemesCss(THEMES, ROLES, themeOf(DEFAULT_THEME)));
writeFileSync(BOOT, withBootIds(readFileSync(BOOT, "utf8"), THEMES, DEFAULT_THEME));
console.log(`sync-themes: ${THEMES.length} themes from ${src}${drift ? ` (was: ${drift})` : " (no change)"}`);
