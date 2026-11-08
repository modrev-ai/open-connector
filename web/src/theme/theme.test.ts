/// <reference types="node" />
// TH-670 (Jong, 2026-11-09: "ensure all color theme matches across all apps and modules of brainet"; TH-676's sweep: OPEN
// CONNECTOR followed its own setting or the OS, so it was white on a light OS inside Mastermind). Inside Mastermind the
// console paints Mastermind's theme. themes.mjs is Mastermind's src/shared/themes.mjs, copied by
// web/scripts/sync-themes.mjs and held equal to it here; mm-themes.css is made from it (the roles as --mm-<role>);
// public/theme-boot.js picks the theme from ?theme= before the first paint and switches on Mastermind's message; theme.ts
// stays dark under it; and outside the theme definitions no stylesheet names a colour of its own.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, ROLES, THEMES, themeOf } from "./themes.mjs";
import { copyOf, header, literalColours, mastermindThemesPath, themesDrift, withBootIds } from "./theme-sync.mjs";
import { mmThemesCss, prefixRoles } from "./mm-themes.mjs";

const APP = "Open Connector";
const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB = resolve(HERE, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const lf = (t: string) => t.replace(/\r\n/g, "\n");
const SOURCE = mastermindThemesPath(process.env, [resolve(WEB, "..", "..", "mastermind"), "C:/Workstation/mastermind"], existsSync, join);
const SHEETS = readdirSync(join(WEB, "src/styles"))
  .filter((f) => f.endsWith(".css"))
  .map((f) => `src/styles/${f}`);

/** The definitions the guard skips besides :root: the console's own .dark palette (upstream's). */
const allow = (_literal: string, selector: string) => selector === ".dark";

describe("one source for the theme's roles (TH-670)", () => {
  it("themes.mjs is Mastermind's src/shared/themes.mjs, byte for byte below the sync's header", () => {
    expect(SOURCE, "a Mastermind checkout to compare with: set MASTERMIND_DIR").not.toBeNull();
    expect(themesDrift(read("src/theme/themes.mjs"), readFileSync(SOURCE!, "utf8"), APP), "run node web/scripts/sync-themes.mjs").toBeNull();
    expect(read("src/theme/themes.mjs").startsWith(header(APP))).toBe(true);
  });

  it("NEGATIVE: a planted drift is caught and named; CRLF is not a drift", () => {
    const source = readFileSync(SOURCE!, "utf8");
    const mine = copyOf(source, APP);
    expect(themesDrift(mine, source, APP)).toBeNull();
    expect(themesDrift(mine.replace('accent: "#ff9f43"', 'accent: "#ff9f44"'), source, APP)).toMatch(/^line \d+ below the header differs: .*#ff9f44.*Mastermind .*#ff9f43/);
    expect(themesDrift(mine.replace(/\n/g, "\r\n"), source, APP)).toBeNull();
  });

  it("mm-themes.css is the sync's, exactly: every role as --mm-<role>, the default's on :root, then each theme", () => {
    const css = lf(read("src/theme/mm-themes.css"));
    expect(css).toBe(mmThemesCss(THEMES, ROLES, themeOf(DEFAULT_THEME)));
    for (const t of THEMES) expect(css).toContain(`:root[data-theme="${t.id}"] { --mm-bg: ${t.tokens.bg}; --mm-surface: ${t.tokens.surface};`);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/(^|[\s;{])--(bg|text|accent|muted|surface):/m);
    expect(prefixRoles(".x { --surface-2: a; --surface: b; color: var(--surface); }", ROLES)).toBe(".x { --mm-surface-2: a; --mm-surface: b; color: var(--surface); }");
  });

  it("under data-theme every colour token of the console is a role; the page loads the roles and the boot script", () => {
    const css = read("src/styles/theme.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const block = /:root\[data-theme\] \{([^}]*)\}/.exec(css)![1];
    for (const m of ["color-scheme: dark;", "--background: var(--mm-bg);", "--foreground: var(--mm-text);", "--card: var(--mm-surface);", "--popover: var(--mm-raised);", "--primary: var(--mm-accent);", "--muted-foreground: var(--mm-muted);", "--destructive: var(--mm-hot);"]) expect(block).toContain(m);
    // Every colour token the light :root sets is set again here, so none is left on the console's own palette.
    const light = /\n:root \{([^}]*)\}/.exec(css)![1];
    const colours = [...light.matchAll(/--([a-z0-9-]+): (rgb|color-mix)\(/g)].map((m) => m[1]).filter((n) => n !== "brand-tile");
    expect(colours.length).toBeGreaterThan(20);
    for (const n of colours) expect(block, `--${n}`).toMatch(new RegExp(String.raw`--${n}: `));
    expect(read("src/style.css")).toMatch(/@import "\.\/theme\/mm-themes\.css";\r?\n@import "\.\/styles\/theme\.css";/);
    const html = read("index.html");
    expect(html.indexOf('<script src="/theme-boot.js"></script>')).toBeGreaterThan(-1);
    expect(html.indexOf('<script src="/theme-boot.js"></script>')).toBeLessThan(html.indexOf("</head>"));
  });

  it("theme.ts resolves dark whenever Mastermind set a theme, before the stored mode or the OS", () => {
    const ts = read("src/theme.ts");
    expect(ts).toMatch(/return typeof document !== "undefined" && document\.documentElement\.hasAttribute\("data-theme"\);/);
    expect(ts).toMatch(/function resolveTheme\(theme: ThemeMode\): ResolvedThemeMode \{\s*if \(mastermindThemed\(\)\) \{\s*return "dark";\s*\}\s*return theme === "auto" \? getSystemTheme\(\) : theme;/);
  });
});

/** Run the boot script as the page would: data-theme, the dark class, the tab's kept id, and a way to post a message. */
function boot(search: string, kept: Record<string, string> = {}, origin = "http://127.0.0.1:3000") {
  const attrs: Record<string, string> = {};
  const classes = new Set<string>();
  const listeners: ((e: unknown) => void)[] = [];
  const win: Record<string, unknown> = { addEventListener: (t: string, fn: (e: unknown) => void) => t === "message" && listeners.push(fn) };
  const sessionStorage = { getItem: (k: string) => kept[k] ?? null, setItem: (k: string, v: string) => (kept[k] = v) };
  const documentElement = { setAttribute: (k: string, v: string) => (attrs[k] = v), classList: { add: (c: string) => classes.add(c) } };
  vm.runInNewContext(read("public/theme-boot.js"), { location: { search, origin }, URLSearchParams, window: win, sessionStorage, document: { documentElement } });
  const post = (data: unknown, from: { source?: unknown; origin?: string } = {}) => listeners.forEach((fn) => fn({ data, source: "source" in from ? from.source : win, origin: from.origin ?? origin }));
  return { theme: () => attrs["data-theme"], dark: () => classes.has("dark"), kept, post };
}

describe("the theme the console shows", () => {
  it("?theme=<id> before the first paint, dark; an unknown id is the default", () => {
    for (const t of THEMES) expect(boot(`?theme=${t.id}`).theme()).toBe(t.id);
    expect(boot("?theme=dark").dark()).toBe(true);
    expect(boot("?theme=bogus").theme()).toBe(DEFAULT_THEME);
    expect(boot("?x=1&theme=ocean").theme()).toBe("ocean");
  });

  it("a reload inside Mastermind's pane, which drops the query, keeps the theme (this tab only)", () => {
    const first = boot("?theme=matrix");
    expect(first.kept["mastermind.theme"]).toBe("matrix");
    expect(boot("", first.kept).theme()).toBe("matrix");
    expect(boot("", { "mastermind.theme": "bogus" }).theme(), "NEGATIVE: a kept id no theme has is ignored").toBeUndefined();
  });

  it("NEGATIVE: opened outside Mastermind (no ?theme=, nothing kept) nothing is set, and the console keeps its own look", () => {
    const page = boot("");
    expect(page.theme()).toBeUndefined();
    expect(page.dark()).toBe(false);
  });

  it("Mastermind's message switches the open page with no reload, for every theme", () => {
    const page = boot("?theme=ember");
    for (const t of THEMES) {
      page.post({ type: "mastermind:theme", theme: t.id });
      expect(page.theme()).toBe(t.id);
    }
  });

  it("NEGATIVE: another origin, another window, another type or an unknown id changes nothing", () => {
    const page = boot("?theme=dark");
    page.post({ type: "mastermind:theme", theme: "neon" }, { origin: "http://evil.example" });
    page.post({ type: "mastermind:theme", theme: "neon" }, { source: {} });
    page.post({ type: "other", theme: "neon" });
    page.post({ type: "mastermind:theme", theme: "bogus" });
    page.post({ type: "mastermind:theme", theme: ["neon"] });
    page.post(null);
    expect(page.theme()).toBe("dark");
  });

  it("the boot script's ids are THEMES', as the sync writes them", () => {
    const js = read("public/theme-boot.js");
    expect(JSON.parse(/var IDS = (\[[^\]]*\]);/.exec(js)![1])).toEqual(THEMES.map((t) => t.id));
    expect(withBootIds(js, THEMES, DEFAULT_THEME)).toBe(lf(js));
  });
});

describe("no literal colour outside the theme definitions (Mastermind's criterion 4)", () => {
  it("every stylesheet's colours are tokens, outside the console's own :root and .dark palettes", () => {
    expect(SHEETS.length).toBeGreaterThan(10);
    const hits = SHEETS.flatMap((f) => literalColours(read(f), allow).map((h) => `${f}: ${h}`));
    expect(hits).toEqual([]);
  });

  it("planted literals are named: hex, rgb, hsl, a named colour, one inside @media; the definitions are not", () => {
    const css = read("src/styles/shell.css");
    const planted = `${css}\n.planted-hex { color: #123456; }\n.planted-rgb { background: rgb(255, 255, 255); }\n.planted-hsl { color: hsl(0, 0%, 50%); }\n.planted-name { border-color: white; }\n@media (max-width: 10px) { .planted-media { color: orange; } }\n`;
    expect(literalColours(planted, allow)).toEqual([".planted-hex: #123456", ".planted-rgb: rgb(255, 255, 255)", ".planted-hsl: hsl(0, 0%, 50%)", ".planted-name: white", ".planted-media: orange"]);
    expect(literalColours(".dark { --x: #000; } :root { --y: #fff; }", allow)).toEqual([]);
  });
});
