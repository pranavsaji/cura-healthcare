import { defineConfig } from "vitest/config";

/**
 * Root Vitest config for the whole workspace. Bare `@cura/*` imports resolve to
 * each package's TS source via pnpm workspace links + package `exports`, so no
 * aliases are needed here. Integration tests use the `*.int.spec.ts` suffix and
 * are excluded from the default (unit) run — see the root `test` scripts.
 */
export default defineConfig({
  // Automatic JSX so `.tsx` specs (design system) compile without React imports.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    globals: true,
    environment: "node",
    // Browser-facing packages opt into jsdom via a per-file docblock
    // (`@vitest-environment jsdom`); the default stays node for speed.
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "libs/**/*.spec.ts",
      "libs/**/*.spec.tsx",
      "apps/**/*.spec.ts",
      "apps/**/*.spec.tsx",
      // Phase 16 hardening harnesses (security / load / chaos).
      "test/**/*.spec.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/build/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      // `all: false` measures only files exercised by tests, so the floor is
      // meaningful per-phase. As each phase lands tests, its package is covered.
      all: false,
      include: ["libs/*/src/**/*.ts", "libs/*/src/**/*.tsx"],
      exclude: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.stories.tsx", "**/index.ts", "**/*.d.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
