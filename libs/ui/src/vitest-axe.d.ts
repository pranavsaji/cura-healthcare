import "vitest";

// jest-axe ships matcher types for jest; augment vitest's expect so
// `expect(results).toHaveNoViolations()` type-checks in our specs.
declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
