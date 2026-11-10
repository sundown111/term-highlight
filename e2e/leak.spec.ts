import { test, expect } from '@playwright/test';

// Heap measurements need Chromium's precise memory info and manual GC.
test.use({ launchOptions: { args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] } });

test('repeated create/destroy cycles do not grow the heap or the highlight registry', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'performance.memory + gc() are Chromium-only');
  test.setTimeout(120_000); // the loop alone takes ~15 s and slows further under parallel load
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);

  const result = await page.evaluate(async () => {
    const lib = (window as never as { lib: typeof import('../src/index.js') }).lib;
    const root = document.getElementById('long')!;
    root.innerHTML = Array.from(
      { length: 300 },
      () => `<p>${'alpha beta gamma delta '.repeat(20)}</p>`
    ).join('');
    const gc = (window as never as { gc: () => void }).gc;
    const heap = async (): Promise<number> => {
      for (let i = 0; i < 3; i++) {
        gc();
        await new Promise((r) => setTimeout(r, 20));
      }
      return (performance as never as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize;
    };
    const cycle = (): void => {
      const h = lib.createHighlighter({
        root,
        autoUpdate: true,
        groups: [
          { name: 'a', terms: ['alpha', 'beta'] },
          { name: 'b', terms: [/gam+a/] },
        ],
      });
      h.next();
      h.setTerms('a', ['delta']);
      h.destroy();
    };
    for (let i = 0; i < 20; i++) cycle(); // warm up JIT and caches
    const before = await heap();
    for (let i = 0; i < 200; i++) cycle();
    const after = await heap();
    return {
      growthMB: (after - before) / 2 ** 20,
      registry: (CSS as never as { highlights: Map<string, unknown> }).highlights.size,
      styles: document.querySelectorAll('style[data-th-instance]').length,
    };
  });

  expect(result.registry).toBe(0);
  expect(result.styles).toBe(0);
  // 200 cycles x ~48k ranges each would be >100 MB if ranges were retained.
  expect(result.growthMB).toBeLessThan(3);
});
