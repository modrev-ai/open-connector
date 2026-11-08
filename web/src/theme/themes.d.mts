// Types for themes.mjs (the copy of Mastermind's src/shared/themes.mjs, plain JS; scripts/sync-themes.mjs, TH-670).
export type Role = "bg" | "surface" | "surface-2" | "raised" | "text" | "muted" | "accent" | "accent-2" | "ok" | "warn" | "hot" | "hot-text";
export interface Theme { id: string; name: string; note: string; tokens: Record<Role, string> }
export const ROLES: readonly Role[];
export const DEFAULT_THEME: string;
export const THEMES: readonly Theme[];
export function themeOf(id: unknown): Theme;
export function isTheme(id: unknown): id is string;
export const THEMED_APPS: readonly string[];
export const LIVE_THEMED_APPS: readonly string[];
export const THEME_MESSAGE: string;
export function themeScript(id: unknown): string | null;
export function withTheme(url: string, id: string): string;
export function themeCss(theme: Theme): string;
