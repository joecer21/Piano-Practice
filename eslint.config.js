import js from "@eslint/js";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**"] },

  js.configs.recommended,

  {
    // Browser application code.
    files: ["*.js", "audio/**/*.js", "domain/**/*.js", "application/**/*.js", "components/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    plugins: { "unused-imports": unusedImports },
    rules: {
      // Dead code should be reported by a tool, not carried as a hypothesis.
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
      // console.warn/error are the module-level error channel; console.log is debug
      // output that should not ship.
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  {
    // Node-side: build scripts and debug harnesses.
    files: ["scripts/**/*.mjs", "*.config.js", "vite.config.js", "vitest.config.js", "playwright.config.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node } },
    rules: { "no-console": "off" },
  },

  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { "no-console": "off" },
  },

  prettier,
];
