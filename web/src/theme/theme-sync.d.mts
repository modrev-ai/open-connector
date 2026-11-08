// Types for theme-sync.mjs (TH-670): the sync's and the theme tests' pure helpers.
import type { Theme } from "./themes.mjs";
export function header(app: string): string;
export function copyOf(source: string, app: string): string;
export function themesDrift(mine: string, source: string, app: string): string | null;
export function mastermindThemesPath(env: Record<string, string | undefined>, candidates: string[], exists: (p: string) => boolean, join: (...p: string[]) => string): string | null;
export function themeBlock(theme: Theme, roles: readonly string[]): string;
export function themesCss(themes: readonly Theme[], roles: readonly string[], def: Theme): string;
export function withRootRoles(css: string, defaultTheme: { tokens: Record<string, string> }, roles: readonly string[]): string;
export function withBootIds(boot: string, themes: readonly { id: string }[], defaultId: string): string;
export function literalColours(css: string, allow?: (literal: string, selector: string) => boolean): string[];
