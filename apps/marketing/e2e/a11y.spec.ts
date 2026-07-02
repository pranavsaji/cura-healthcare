import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * Accessibility e2e: run axe-core against the home page and a product page and
 * assert zero violations (Phase 15 acceptance). axe-core is injected from the
 * workspace install (bundled via jest-axe) so there is no extra dependency.
 */
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf-8");

async function runAxe(page: import("@playwright/test").Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    // @ts-expect-error injected global
    const results = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    return results.violations.map(
      (v: { id: string; nodes: { target: string[]; html: string }[] }) => ({
        id: v.id,
        count: v.nodes.length,
        nodes: v.nodes.slice(0, 20).map((n) => ({ target: n.target, html: n.html.slice(0, 120) })),
      }),
    );
  });
}

for (const path of ["/", "/curanote"]) {
  test(`axe finds 0 violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    const violations = await runAxe(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
}
