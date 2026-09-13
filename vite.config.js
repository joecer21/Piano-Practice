import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { offlinePlugin } from "./scripts/offline-plugin.mjs";

export default defineConfig({
  plugins: [react(), offlinePlugin()],
  // Relative base so the same bundle works at a domain root and under a GitHub
  // Pages project path (/Piano-Practice/) without environment-specific config.
  base: "./",
  publicDir: "public",
  server: {
    host: "127.0.0.1",
  },
  preview: {
    host: "127.0.0.1",
  },
});
