import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // Coach component specs opt into jsdom per file with a docblock.
    include: ["tests/*.spec.{js,jsx}"],
    restoreMocks: true,
  },
});
