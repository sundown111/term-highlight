import { test, expect } from '@playwright/test';

// Coarse regression guards, not benchmarks (see bench/ for real numbers). Budgets are
// roughly 8-10x the slowest engine measured on a 2021 laptop, so they only trip on
// algorithmic regressions (e.g. the old O(n^2) overlap resolution took ~8 s here).
test('100k words: initial highlight, update and destroy stay within budget', async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
  const t = await page.evaluate(() => {
    const lib = (window as never as { lib: typeof import('../src/index.js') }).lib;
    const root = document.getElementById('long')!;
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    root.innerHTML = Array.from(
      { length: 2500 },
      (_, p) => `<p>${Array.from({ length: 40 }, (_, i) => words[(p + i * 7) % 5]).join(' ')}</p>`
    ).join('');
    const time = <T>(fn: () => T): [number, T] => {
      const s = performance.now();
      const r = fn();
      return [performance.now() - s, r];
    };
    const [initial, h] = time(() =>
      lib.createHighlighter({
        root,
        groups: [
          { name: 'a', terms: ['alpha', 'bravo'] },
          { name: 'b', terms: [/ch\w+/] },
        ],
      })
    );
    const [update] = time(() => h.setTerms('a', ['delta']));
    const [destroy] = time(() => h.destroy());
    return { initial, update, destroy, matches: 2500 * 40 };
  });
  expect(t.initial).toBeLessThan(4000);
  expect(t.update).toBeLessThan(4000);
  expect(t.destroy).toBeLessThan(2000);
});
