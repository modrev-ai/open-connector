// Types for mm-themes.mjs (TH-670).
import type { Role, Theme } from "./themes.mjs";
export function prefixRoles(css: string, roles: readonly Role[]): string;
export function mmThemesCss(themes: readonly Theme[], roles: readonly Role[], def: Theme): string;
