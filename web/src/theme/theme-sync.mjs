// TH-670 (Jong, 2026-11-09: "ensure all color theme matches across all apps and modules of brainet"): one source for
// the theme's roles. Mastermind's src/shared/themes.mjs is the source; this app keeps a copy of it, byte for byte under
// a two-line header, and its stylesheet's theme blocks, its bare :root and its boot script's ids are made from that
// copy. scripts/sync-themes.mjs writes them; the theme tests hold them equal to Mastermind's file, so a change to a role
// is made once, in Mastermind, and a copy left behind goes red here. Pure: the script and the tests pass in fs.
// The same file in task-hub (scripts/), third-brain (web/src/theme/) and financial-cortex (TH-670); Mev has its own (TH-366).

/** The copy's two-line header: what it is and how it is remade. */
export const header = (app) =>
  `// Copied from mastermind src/shared/themes.mjs by scripts/sync-themes.mjs (TH-670): ${app}'s copy of Mastermind's\n` +
  `// themes, the one source of the theme's roles. Edit Mastermind's file and run the sync; never edit this one.\n`;

const lf = (s) => String(s).replace(/\r\n/g, "\n");

/** This app's copy of Mastermind's themes.mjs `source`. */
export const copyOf = (source, app) => header(app) + lf(source);

/** Why `mine` is not `source` under its header (the first line that differs), or null when it is. CRLF is not a drift. */
export function themesDrift(mine, source, app) {
  const m = lf(mine);
  const h = header(app);
  if (!m.startsWith(h)) return "the copy's two-line header is not the sync's";
  const a = m.slice(h.length).split("\n");
  const b = lf(source).split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    const x = a[i] ?? "(nothing)";
    const y = b[i] ?? "(nothing)";
    let c = 0;
    while (c < x.length && x[c] === y[c]) c++;
    const near = (t) => JSON.stringify(t.slice(Math.max(0, c - 30), c + 30));
    return `line ${i + 1} below the header differs: ${app} has ${near(x)}, Mastermind ${near(y)}`;
  }
  return null;
}

/** Mastermind's themes.mjs: MASTERMIND_DIR first, then each candidate checkout; null when none has it. */
export function mastermindThemesPath(env, candidates, exists, join) {
  const dirs = [env?.MASTERMIND_DIR, ...candidates].filter(Boolean);
  for (const d of dirs) {
    const p = join(d, "src", "shared", "themes.mjs");
    if (exists(p)) return p;
  }
  return null;
}

/** One theme's block: `:root[data-theme="<id>"] { --role: value; ... }`, the :root half of Mastermind's themeCss. */
export const themeBlock = (theme, roles) => `:root[data-theme="${theme.id}"] { ${roles.map((r) => `--${r}: ${theme.tokens[r]};`).join(" ")} }`;

/** A whole themes.css: the default theme's bare :root (the page opened outside Mastermind), then one block per theme. */
export function themesCss(themes, roles, def) {
  return `/* Mastermind's themes (TH-670), written by scripts/sync-themes.mjs from themes.mjs, the copy of mastermind's
   src/shared/themes.mjs: never edit by hand. The bare :root is the default theme's (the page opened outside
   Mastermind); the boot script sets data-theme from ?theme= and from Mastermind's message. */
:root {
${roles.map((r) => `  --${r}: ${def.tokens[r]};`).join("\n")}
}
${themes.map((t) => themeBlock(t, roles)).join("\n")}
`;
}

/** `css` with every role line (`  --<role>: <value>;`) of its FIRST bare `:root {` block set to the default theme's. */
export function withRootRoles(css, defaultTheme, roles) {
  const text = lf(css);
  const at = text.indexOf(":root {");
  if (at < 0) throw new Error("no bare :root block to hold the default theme's roles");
  const end = text.indexOf("\n}", at);
  let root = text.slice(at, end);
  for (const r of roles) {
    const line = new RegExp(`(\\n\\s*--${r.replace(/-/g, "\\-")}: )[^;]+;`);
    if (!line.test(root)) throw new Error(`the bare :root has no --${r} line`);
    root = root.replace(line, `$1${defaultTheme.tokens[r]};`);
  }
  return text.slice(0, at) + root + text.slice(end);
}

/** `boot` with its `var IDS = [...]` and `var DEFAULT_THEME = "..."` set from the themes. */
export function withBootIds(boot, themes, defaultId) {
  const text = lf(boot);
  if (!/var IDS = \[[^\]]*\];/.test(text) || !/var DEFAULT_THEME = "[^"]*";/.test(text)) throw new Error("the boot script has no IDS or DEFAULT_THEME line");
  return text.replace(/var IDS = \[[^\]]*\];/, `var IDS = ${JSON.stringify(themes.map((t) => t.id)).replace(/,/g, ", ")};`).replace(/var DEFAULT_THEME = "[^"]*";/, `var DEFAULT_THEME = "${defaultId}";`);
}

/**
 * Literal colours in `css` outside its theme definitions, as "selector: literal": #hex, rgb()/rgba(), hsl()/hsla() and
 * named colours (Mastermind's test/themes.test.mjs criterion 4). Comments are dropped; a bare `:root` block and a
 * `:root[data-theme="<id>"]` block are the definitions and are skipped. `allow` returns true for a literal that may
 * stay (a shadow's black, say).
 */
export function literalColours(css, allow = () => false) {
  const bare = lf(css).replace(/\/\*[\s\S]*?\*\//g, "");
  const LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)|(?<![\w-])(white|black|red|blue|green|cyan|magenta|yellow|orange|purple|gray|grey|pink|silver|gold|navy|teal|lime|maroon|olive|aqua|fuchsia)(?![\w-])/gi;
  const out = [];
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    if (selector === ":root" || /^:root\[data-theme="[a-z0-9-]+"\]$/.test(selector)) continue;
    for (const c of m[2].matchAll(LITERAL)) if (!allow(c[0], selector)) out.push(`${selector}: ${c[0]}`);
  }
  return out;
}
