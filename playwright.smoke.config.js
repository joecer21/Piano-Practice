import { defineConfig, devices } from "@playwright/test";

// Smoke tests for a deployed build - GitHub Pages after a deploy, or a release
// candidate - rather than the local preview. There is deliberately no webServer.
//
//   SMOKE_BASE_URL=https://joecer21.github.io/Piano-Practice/ npm run test:smoke
//   SMOKE_BASE_URL=... SMOKE_EXPECTED_COMMIT=<sha> npm run test:smoke
const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) throw new Error("Set SMOKE_BASE_URL to the deployed site, ending in a slash.");

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-smoke-report" }]]
    : "list",
  use: {
    baseURL: baseURL.endsWith("/") ? baseURL : `${baseURL}/`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
