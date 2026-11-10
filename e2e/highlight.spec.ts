import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    lib: typeof import('../src/index.js');
    h: import('../src/index.js').Highlighter;
    events: unknown[];
  }
}

async function open(page: Page): Promise<void> {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true);
}

/** Colour of one pixel from a real screenshot of a small clip. */
async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
  // Highlights are painted on the next frames; WebKit 27 needs them before a screenshot.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  );
  const png = await page.screenshot({ clip: { x, y, width: 3, height: 3 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0]!, d[1]!, d[2]!] as [number, number, number];
  }, png.toString('base64'));
}

/** Pixel near the bottom-left of a match's box: mostly background, little glyph ink. */
async function pixelAtMatch(page: Page, index: number): Promise<[number, number, number]> {
  const r = await page.evaluate((i) => {
    const b = window.h.getMatches()[i]!.range.getBoundingClientRect();
    return { x: b.left, y: b.bottom };
  }, index);
  return pixelAt(page, r.x + 1, r.y - 4);
}

const near = (a: number[], b: number[], tol = 12): boolean =>
  a.every((v, i) => Math.abs(v - b[i]!) <= tol);

test.describe('CSS Custom Highlight API in a real browser', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test('feature detection and strategy', async ({ page }) => {
    const info = await page.evaluate(() => ({
      supported: window.lib.supportsCssHighlight(),
      hasHighlight: typeof (window as never as { Highlight?: unknown }).Highlight,
      hasRegistry: !!(CSS as never as { highlights?: unknown }).highlights,
    }));
    expect(info).toEqual({ supported: true, hasHighlight: 'function', hasRegistry: true });
  });

  test('paints matches without touching the DOM', async ({ page }) => {
    const result = await page.evaluate(() => {
      const root = document.getElementById('root')!;
      const before = root.innerHTML;
      window.h = window.lib.createHighlighter({
        root,
        groups: [{ name: 'a', terms: ['cat'], style: { backgroundColor: 'rgb(255, 0, 0)' } }],
      });
      return {
        strategy: window.h.activeStrategy,
        same: root.innerHTML === before,
        count: window.h.getMatches().length,
        registry: (CSS as never as { highlights: Map<string, { size: number }> }).highlights.size,
      };
    });
    expect(result).toEqual({ strategy: 'css-highlight', same: true, count: 3, registry: 1 });
    expect(near(await pixelAtMatch(page, 0), [255, 0, 0])).toBe(true);
    // An unhighlighted word ("dog") stays plain white.
    const dog = await page.evaluate(() => {
      const r = document.createRange();
      const t = document.getElementById('p1')!.firstChild as Text;
      r.setStart(t, 4);
      r.setEnd(t, 7);
      const b = r.getBoundingClientRect();
      return { x: b.left, y: b.bottom };
    });
    expect(near(await pixelAt(page, dog.x + 1, dog.y - 4), [255, 255, 255])).toBe(true);
  });

  test('overlapping highlights obey priority', async ({ page }) => {
    await page.evaluate(() => {
      window.h = window.lib.createHighlighter({
        root: document.getElementById('root')!,
        overlapStrategy: 'allow-overlap',
        groups: [
          { name: 'lo', terms: ['cat'], priority: 1, style: { backgroundColor: 'rgb(255, 0, 0)' } },
          { name: 'hi', terms: ['cat'], priority: 5, style: { backgroundColor: 'rgb(0, 0, 255)' } },
        ],
      });
    });
    expect(await page.evaluate(() => window.h.getMatches().length)).toBe(6);
    expect(near(await pixelAtMatch(page, 0), [0, 0, 255])).toBe(true);
    await page.evaluate(() => window.h.updateGroup('lo', { priority: 9 }));
    const red = await page.evaluate(() => window.h.getMatches().findIndex((m) => m.group === 'lo'));
    expect(near(await pixelAtMatch(page, red), [255, 0, 0])).toBe(true);
  });

  test('click and hover callbacks fire on real highlights only', async ({ page }) => {
    await page.evaluate(() => {
      window.events = [];
      window.h = window.lib.createHighlighter({
        root: document.getElementById('root')!,
        groups: [{ name: 'a', terms: ['bird'] }],
        onHighlightClick: (m) => window.events.push(['click', m.text]),
        onHighlightHover: (m) => window.events.push(['hover', m?.text ?? null]),
      });
    });
    const pos = await page.evaluate(() => {
      const b = window.h.getMatches()[0]!.range.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    await page.mouse.move(pos.x, pos.y);
    await page.mouse.click(pos.x, pos.y);
    await page.mouse.move(2, 2);
    await page.mouse.click(2, 2);
    await expect
      .poll(() => page.evaluate(() => window.events))
      .toEqual([
        ['hover', 'bird'],
        ['click', 'bird'],
        ['hover', null],
      ]);
  });

  test('navigation moves the current match and scrolls it into view', async ({ page }) => {
    await page.evaluate(() => {
      const long = document.getElementById('long')!;
      long.innerHTML = Array.from(
        { length: 60 },
        (_, i) => `<p>line ${i}${i === 55 ? ' needle' : ''}</p>`
      ).join('');
      window.h = window.lib.createHighlighter({
        root: document.getElementById('scroller')!,
        scroll: 'instant',
        groups: [{ name: 'n', terms: ['needle'] }],
      });
      window.h.next();
    });
    const state = await page.evaluate(() => ({
      scrollTop: document.getElementById('scroller')!.scrollTop,
      current: window.h.current?.text,
      keys: Array.from(
        (CSS as never as { highlights: Map<string, unknown> }).highlights.keys()
      ).filter((k) => k.endsWith('-current')).length,
    }));
    expect(state.current).toBe('needle');
    expect(state.keys).toBe(1);
    expect(state.scrollTop).toBeGreaterThan(500);
  });

  test('dynamic updates and autoUpdate reflect DOM changes', async ({ page }) => {
    const counts = await page.evaluate(async () => {
      const root = document.getElementById('root')!;
      window.h = window.lib.createHighlighter({
        root,
        autoUpdate: true,
        groups: [{ name: 'a', terms: ['cat'] }],
      });
      const out: number[] = [window.h.getMatches().length];
      window.h.setTerms('a', ['fish']);
      out.push(window.h.getMatches().length);
      window.h.setTerms('a', ['cat', 'fish']);
      root.insertAdjacentHTML('beforeend', '<p>cat</p>');
      await new Promise((r) => setTimeout(r, 50));
      out.push(window.h.getMatches().length);
      window.h.clear();
      out.push(window.h.getMatches().length);
      return out;
    });
    expect(counts).toEqual([3, 1, 5, 0]);
  });

  test('destroy removes registry entries, styles and listeners; instances stay isolated', async ({
    page,
  }) => {
    const r = await page.evaluate(() => {
      const reg = (CSS as never as { highlights: Map<string, unknown> }).highlights;
      const a = window.lib.createHighlighter({
        root: document.getElementById('p1')!,
        groups: [{ name: 'g', terms: ['cat'] }],
      });
      const b = window.lib.createHighlighter({
        root: document.getElementById('p2')!,
        groups: [{ name: 'g', terms: ['cat'] }],
      });
      const both = reg.size;
      a.destroy();
      const afterA = reg.size;
      const bMatches = b.getMatches().length;
      b.destroy();
      return {
        both,
        afterA,
        bMatches,
        afterB: reg.size,
        styles: document.querySelectorAll('style[data-th-instance]').length,
      };
    });
    expect(r).toEqual({ both: 2, afterA: 1, bMatches: 1, afterB: 0, styles: 0 });
  });

  test('stress: 20k matches complete and destroy cleanly', async ({ page }) => {
    const r = await page.evaluate(() => {
      const root = document.getElementById('long')!;
      root.textContent = 'a '.repeat(20_000);
      const h = window.lib.createHighlighter({ root, groups: [{ name: 'g', terms: ['a'] }] });
      const n = h.getMatches().length;
      h.destroy();
      return { n, reg: (CSS as never as { highlights: Map<string, unknown> }).highlights.size };
    });
    expect(r).toEqual({ n: 20_000, reg: 0 });
  });
});

test.describe('unsupported API (mocked)', () => {
  test('missing Highlight/CSS.highlights degrades to none and leaves the DOM alone', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      delete (window as never as { Highlight?: unknown }).Highlight;
      delete (CSS as never as { highlights?: unknown }).highlights;
    });
    await open(page);
    const r = await page.evaluate(() => {
      const root = document.getElementById('root')!;
      const before = root.innerHTML;
      const h = window.lib.createHighlighter({ root, groups: [{ name: 'a', terms: ['cat'] }] });
      let forced = '';
      try {
        window.lib.createHighlighter({ root, strategy: 'css-highlight', groups: [] });
      } catch (e) {
        forced = (e as Error).message;
      }
      return {
        supported: window.lib.supportsCssHighlight(),
        strategy: h.activeStrategy,
        matches: h.getMatches().length,
        untouched: root.innerHTML === before,
        forced,
      };
    });
    expect(r.supported).toBe(false);
    expect(r.strategy).toBe('none');
    expect(r.matches).toBe(3);
    expect(r.untouched).toBe(true);
    expect(r.forced).toMatch(/not available/);
  });

  test('partial support (Highlight without registry) is treated as unsupported', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      delete (CSS as never as { highlights?: unknown }).highlights;
    });
    await open(page);
    expect(await page.evaluate(() => window.lib.supportsCssHighlight())).toBe(false);
  });

  test('dom-span fallback wraps and fully restores the DOM', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const root = document.getElementById('root')!;
      const before = root.innerHTML;
      const h = window.lib.createHighlighter({
        root,
        strategy: 'dom-span',
        groups: [{ name: 'a', terms: ['cat'] }],
      });
      const marks = root.querySelectorAll('mark').length;
      h.destroy();
      root.normalize();
      return { marks, restored: root.innerHTML === before };
    });
    expect(r).toEqual({ marks: 3, restored: true });
  });
});
