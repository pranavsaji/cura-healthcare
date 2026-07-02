import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

/**
 * Flat ESLint config. Enforces the monorepo dependency rule from
 * docs/CONVENTIONS.md §1 via path-scoped `no-restricted-imports`:
 *   - apps may import libs; libs MUST NOT import apps
 *   - libs/shared is L0: it may import nothing from @cura/* (only third-party)
 * Cycles/upward imports therefore fail `pnpm lint`.
 */
const APP_PACKAGES = [
  "@cura/api",
  "@cura/web",
  "@cura/marketing",
  "@cura/worker",
  "@cura/voice",
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.nx/**",
      "**/build/**",
      "**/coverage/**",
      "**/*.d.ts",
      "libs/db/drizzle/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { import: importPlugin },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-undef": "off", // TypeScript handles undefined identifiers
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "never",
        },
      ],
    },
  },
  // Boundary: libs must never import apps.
  {
    files: ["libs/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [...APP_PACKAGES, "**/apps/**"],
              message: "Boundary violation: libs must not import apps (docs/CONVENTIONS.md §1).",
            },
          ],
        },
      ],
    },
  },
  // Layer L0: libs/shared may only depend on third-party packages (e.g. zod).
  {
    files: ["libs/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@cura/*", "**/libs/**"],
              message: "libs/shared is L0 (docs/CONVENTIONS.md §1): only third-party imports allowed.",
            },
          ],
        },
      ],
    },
  },
  // Test files: relax a couple of rules.
  {
    files: ["**/*.spec.ts", "**/*.spec.tsx", "libs/testing/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
