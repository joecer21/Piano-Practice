import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/pwa/global-setup.js",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Deploy-to-deploy service-worker behaviour does not depend on the viewport.
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /pwa-lifecycle/ },
  ],
  webServer: {
    // Exercise the production bundle, not the dev server. `npm run check` built
    // dist/ and then never loaded it, so nothing verified what actually ships.
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
