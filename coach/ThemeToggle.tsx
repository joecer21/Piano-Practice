import { useEffect, useState } from "react";
import { browserStorage, subscribeToStorageKey } from "../infrastructure/browser-storage.js";
import { Icon } from "./Icon.js";
import {
  THEME_LABELS,
  THEME_STORAGE_KEY,
  applyTheme,
  documentTheme,
  loadTheme,
  otherTheme,
  saveTheme,
} from "./theme.js";
import type { Theme } from "./theme.js";

/**
 * Switch between the studio and paper themes. The page already shows the stored
 * choice before React mounts (index.html), so this starts from the document, and
 * follows a change made in another tab.
 */
export function ThemeToggle({ doc = document }: { doc?: Document }) {
  const [theme, setTheme] = useState<Theme>(() => documentTheme(doc));

  useEffect(
    () =>
      subscribeToStorageKey(doc.defaultView, THEME_STORAGE_KEY, () => {
        const stored = loadTheme(browserStorage(doc.defaultView));
        applyTheme(stored, doc);
        setTheme(stored);
      }),
    [doc],
  );

  const next = otherTheme(theme);
  return (
    <button
      type="button"
      className="coach-theme-toggle coach-tool-trigger coach-tool-icon"
      aria-label={`Switch to ${THEME_LABELS[next].toLowerCase()} theme`}
      onClick={() => {
        applyTheme(next, doc);
        saveTheme(browserStorage(doc.defaultView), next);
        setTheme(next);
      }}
    >
      <Icon name={next === "paper" ? "sun" : "moon"} />
    </button>
  );
}
