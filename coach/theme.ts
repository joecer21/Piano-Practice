import type { BrowserStorage } from "../infrastructure/browser-storage.js";

/**
 * The two visual themes. Studio (warm low light) is the default; paper is the
 * warm light alternative. The choice is a presentation preference, so it lives
 * under its own storage key rather than in the versioned library (docs/storage.md).
 *
 * index.html applies a stored choice before first paint with an inline script
 * that repeats THEME_STORAGE_KEY and the paper colour; tests/theme.spec.js keeps
 * the two in step.
 */
export type Theme = "studio" | "paper";

export const THEMES: readonly Theme[] = ["studio", "paper"];
export const DEFAULT_THEME: Theme = "studio";
export const THEME_STORAGE_KEY = "piano-practice:theme";

/** Browser chrome colour per theme: the page ground from styles/tokens.css. */
export const THEME_COLORS: Readonly<Record<Theme, string>> = Object.freeze({
  studio: "#181513",
  paper: "#f6f1eb",
});

export const THEME_LABELS: Readonly<Record<Theme, string>> = Object.freeze({
  studio: "Studio",
  paper: "Paper",
});

export function parseTheme(value: unknown): Theme | null {
  return value === "studio" || value === "paper" ? value : null;
}

export function otherTheme(theme: Theme): Theme {
  return theme === "studio" ? "paper" : "studio";
}

/** The theme the document is showing now. */
export function documentTheme(doc: Document = document): Theme {
  return parseTheme(doc.documentElement.dataset.theme) ?? DEFAULT_THEME;
}

export function applyTheme(theme: Theme, doc: Document = document) {
  doc.documentElement.dataset.theme = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

export function loadTheme(storage: BrowserStorage | null): Theme {
  try {
    return parseTheme(storage?.getItem(THEME_STORAGE_KEY)) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Best effort, like every other write: blocked storage just forgets the choice. */
export function saveTheme(storage: BrowserStorage | null, theme: Theme) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this visit.
  }
}
