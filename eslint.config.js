import js from "@eslint/js";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**"] },

  js.configs.recommended,

  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ["**/*.ts", "**/*.tsx"] })),

  {
    files: ["coach/**/*.{ts,tsx}", "tests/**/*.jsx"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

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
    // Product code generates assignments for learners, so it must go through
    // generateLearnerAssignment, which refuses motifs a mode does not offer. The
    // unrestricted generateAssignment stays available to tests and reports.
    files: [
      "main.js",
      "ui.js",
      "presets.js",
      "application/**/*.js",
      "components/**/*.js",
      "coach/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["./domain/assignment.js", "../domain/assignment.js"].map((name) => ({
            name,
            importNames: ["generateAssignment"],
            message:
              "Use generateLearnerAssignment: learner-facing generation must refuse motifs the mode does not offer.",
          })),
        },
      ],
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
    files: ["input/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "../application/**",
                "../coach/**",
                "../ui.js",
                "../main.js",
                "../audio.js",
                "../audio/**",
              ],
              message:
                "input/ is a neutral stream of what the player plays; it must not know about the app, UI, coach or audio.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["tests/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { "no-console": "off" },
  },

  prettier,
];
