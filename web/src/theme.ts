import * as React from "react";

export type ThemeMode = "auto" | "light" | "dark";
export type ResolvedThemeMode = "light" | "dark";

const themeStorageKey = "oomol-connect.theme-mode";
const darkSchemeQuery = "(prefers-color-scheme: dark)";
const fallbackSnapshot: ThemeSnapshot = { theme: "auto", resolvedTheme: "light" };

interface ThemeSnapshot {
  theme: ThemeMode;
  resolvedTheme: ResolvedThemeMode;
}

const listeners = new Set<() => void>();
let snapshot: ThemeSnapshot | null = null;
let listening = false;

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === "auto" || stored === "light" || stored === "dark") {
    return stored;
  }
  return "auto";
}

function getSystemTheme(): ResolvedThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia(darkSchemeQuery).matches ? "dark" : "light";
}

/**
 * TH-670: whether Mastermind is showing this console on one of its themes (public/theme-boot.js set data-theme). Every
 * Mastermind theme is dark, so then the page is dark whatever the OS or the stored mode says.
 */
export function mastermindThemed(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute("data-theme");
}

function resolveTheme(theme: ThemeMode): ResolvedThemeMode {
  if (mastermindThemed()) {
    return "dark";
  }
  return theme === "auto" ? getSystemTheme() : theme;
}

function applyTheme(theme: ResolvedThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.toggle("dark", theme === "dark");
}

function createSnapshot(): ThemeSnapshot {
  const theme = getInitialTheme();
  return { theme, resolvedTheme: resolveTheme(theme) };
}

function getSnapshot(): ThemeSnapshot {
  snapshot ??= createSnapshot();
  return snapshot;
}

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

function syncSnapshot(): void {
  const nextSnapshot = createSnapshot();
  const previousSnapshot = snapshot;
  applyTheme(nextSnapshot.resolvedTheme);

  if (previousSnapshot?.theme === nextSnapshot.theme && previousSnapshot.resolvedTheme === nextSnapshot.resolvedTheme) {
    return;
  }

  snapshot = nextSnapshot;
  emitChange();
}

function ensureListeners(): void {
  if (listening || typeof window === "undefined") {
    return;
  }

  window.addEventListener("storage", (event) => {
    if (event.key === themeStorageKey) {
      syncSnapshot();
    }
  });
  window.matchMedia(darkSchemeQuery).addEventListener("change", syncSnapshot);
  listening = true;
}

function subscribe(listener: () => void): () => void {
  ensureListeners();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function useThemeMode(): {
  theme: ThemeMode;
  resolvedTheme: ResolvedThemeMode;
  setTheme: (nextTheme: ThemeMode) => void;
  toggleTheme: () => void;
} {
  const themeSnapshot = React.useSyncExternalStore(subscribe, getSnapshot, () => fallbackSnapshot);
  const { theme, resolvedTheme } = themeSnapshot;

  React.useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = React.useCallback((nextTheme: ThemeMode) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(themeStorageKey, nextTheme);
    snapshot = { theme: nextTheme, resolvedTheme: resolveTheme(nextTheme) };
    applyTheme(snapshot.resolvedTheme);
    emitChange();
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "auto" ? "light" : theme === "light" ? "dark" : "auto");
  }, [setTheme, theme]);

  return { theme, resolvedTheme, setTheme, toggleTheme };
}
