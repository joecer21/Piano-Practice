// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "../coach/ThemeToggle.tsx";
import {
  DEFAULT_THEME,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  applyTheme,
  documentTheme,
  loadTheme,
  parseTheme,
  saveTheme,
} from "../coach/theme.ts";

const html = readFileSync(resolve("index.html"), "utf8");
const tokens = readFileSync(resolve("styles/tokens.css"), "utf8");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
  localStorage.clear();
});
afterEach(cleanup);

describe("theme preference", () => {
  it("defaults to studio and accepts only the two known themes", () => {
    expect(DEFAULT_THEME).toBe("studio");
    expect(parseTheme("paper")).toBe("paper");
    expect(parseTheme("dark")).toBeNull();
    expect(loadTheme(memoryStorage({ [THEME_STORAGE_KEY]: "neon" }))).toBe("studio");
    expect(loadTheme(null)).toBe("studio");
  });

  it("survives storage that throws", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadTheme(blocked)).toBe("studio");
    expect(() => saveTheme(blocked, "paper")).not.toThrow();
  });

  it("stamps the document and the browser chrome colour", () => {
    applyTheme("paper");
    expect(document.documentElement.dataset.theme).toBe("paper");
    expect(documentTheme()).toBe("paper");
    expect(document.querySelector('meta[name="theme-color"]').getAttribute("content")).toBe(
      THEME_COLORS.paper,
    );
  });

  it("keeps the pre-paint script and the stylesheet in step with coach/theme.ts", () => {
    expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}") === "paper"`);
    expect(html).toContain(`setAttribute("content", "${THEME_COLORS.paper}")`);
    expect(html).toContain(`<meta name="theme-color" content="${THEME_COLORS.studio}" />`);
    expect(html).toContain('<html lang="en" data-theme="studio">');
    expect(tokens).toMatch(new RegExp(`\\[data-theme="studio"\\][^}]*--bg: ${THEME_COLORS.studio};`));
    expect(tokens).toMatch(new RegExp(`\\[data-theme="paper"\\][^}]*--bg: ${THEME_COLORS.paper};`));
  });
});

describe("ThemeToggle", () => {
  it("switches theme, remembers it, and names the theme it switches to", () => {
    document.documentElement.dataset.theme = "studio";
    render(createElement(ThemeToggle));
    const toggle = screen.getByRole("button", { name: "Switch to paper theme" });

    act(() => toggle.click());
    expect(document.documentElement.dataset.theme).toBe("paper");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("paper");
    expect(screen.getByRole("button", { name: "Switch to studio theme" })).toBeTruthy();
  });

  it("follows a theme chosen in another tab", () => {
    document.documentElement.dataset.theme = "studio";
    render(createElement(ThemeToggle));

    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, "paper");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });
    expect(document.documentElement.dataset.theme).toBe("paper");
    expect(screen.getByRole("button", { name: "Switch to studio theme" })).toBeTruthy();
  });
});
