import js from "@eslint/js";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**"] },

  js.configs.recommended,

  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ["**/*.ts"] })),

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
    // New domain boundaries are strict TypeScript; legacy JavaScript remains
    // opt-in checked with its existing `// @ts-check` directives.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  {
    files: ["audio.js", "audio/**/*.{js,ts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./application/**", "../application/**", "./ui.js", "../ui.js"],
              message:
                "The audio layer accepts domain data through its public contract; it must not read app state or UI.",
            },
          ],
        },
      ],
    },
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
