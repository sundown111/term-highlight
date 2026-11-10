import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHighlighter, connectSearchInput } from '../src/index.js';
import type { Highlighter, MatchInfo } from '../src/index.js';
import { hitTestRanges } from '../src/renderers/pointer.js';
import {
  cssEscapeIdent,
  debounce,
  findScrollParent,
  scrollRectToCenter,
  camelToKebab,
} from '../src/utils.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function root(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}
function highlighter(el: HTMLElement, extra: object = {}): Highlighter {
  const h = createHighlighter({ root: el, strategy: 'none', groups: [], ...extra });
  cleanup.push(() => h.destroy());
  return h;
}
/** Give every Range in the document fake layout (jsdom has none). */
function fakeRects(rect: { left: number; right: number; top: number; bottom: number }): void {
  Range.prototype.getClientRects = function () {
    return [rect] as unknown as DOMRectList;
  };
  Range.prototype.getBoundingClientRect = function () {
    return { ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top } as DOMRect;
  };
}

describe('none renderer / pointer handling', () => {
  it('fires click and hover callbacks with the match under the pointer', async () => {
    fakeRects({ left: 0, right: 100, top: 0, bottom: 20 });
    const clicks: string[] = [];
    const hovers: Array<string | undefined> = [];
    const el = root('cat dog');
    highlighter(el, {
      groups: [{ name: 'a', terms: ['cat'] }],
      onHighlightClick: (m: MatchInfo) => void clicks.push(m.text),
      onHighlightHover: (m: MatchInfo | undefined) => void hovers.push(m?.text),
    });
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
    expect(clicks).toEqual(['cat']);

    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }));
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 6, clientY: 5 }));
    await new Promise((r) => setTimeout(r, 50));
    expect(hovers).toEqual(['cat']);
    el.dispatchEvent(new MouseEvent('mouseleave'));
    expect(hovers).toEqual(['cat', undefined]);

    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 500, clientY: 500 }));
    expect(clicks).toEqual(['cat']);
  });

  it('getMatchAt skips hidden groups', () => {
    fakeRects({ left: 0, right: 100, top: 0, bottom: 20 });
    const h = highlighter(root('cat'), { groups: [{ name: 'a', terms: ['cat'] }] });
    expect(h.getMatchAt(5, 5)?.text).toBe('cat');
    h.toggleGroup('a', false);
    expect(h.getMatchAt(5, 5)).toBeUndefined();
  });

  it('getMatchRect and navigation work with the none renderer', () => {
    fakeRects({ left: 0, right: 10, top: 0, bottom: 10 });
    const h = highlighter(root('cat cat'), { groups: [{ name: 'a', terms: ['cat'] }] });
    expect(h.next()?.index).toBe(0);
    expect(h.next()?.index).toBe(1);
    expect(h.previous()?.index).toBe(0);
    h.clearCurrent();
    expect(h.current).toBeUndefined();
  });

  it('uses requestAnimationFrame for hover throttling when available', () => {
    fakeRects({ left: 0, right: 100, top: 0, bottom: 20 });
    const el = root('cat');
    const frames: Array<() => void> = [];
    window.requestAnimationFrame = ((cb: () => void) => frames.push(cb)) as never;
    window.cancelAnimationFrame = (() => {}) as never;
    const hovers: Array<string | undefined> = [];
    highlighter(el, {
      groups: [{ name: 'a', terms: ['cat'] }],
      onHighlightHover: (m: MatchInfo | undefined) => void hovers.push(m?.text),
    });
    for (let i = 0; i < 5; i++) el.dispatchEvent(new MouseEvent('mousemove', { clientX: 1 }));
    expect(frames).toHaveLength(1);
    frames[0]!();
    expect(hovers).toEqual(['cat']);
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 1 }));
    el.dispatchEvent(new MouseEvent('mouseleave'));
  });
});

describe('hitTestRanges', () => {
  it('narrows candidates with caret APIs, and tolerates failures', () => {
    const el = root('cat dog');
    const h = highlighter(el, { groups: [{ name: 'a', terms: ['cat', 'dog'] }] });
    fakeRects({ left: 0, right: 100, top: 0, bottom: 20 });
    const matches = h.getMatches();
    const text = el.firstChild!;
    const doc = document as unknown as Record<string, unknown>;

    doc.caretRangeFromPoint = () => {
      const r = document.createRange();
      r.setStart(text, 5);
      r.setEnd(text, 5);
      return r;
    };
    expect(hitTestRanges(document, matches, 1, 1, () => true)?.text).toBe('dog');

    doc.caretRangeFromPoint = () => {
      throw new Error('nope');
    };
    expect(hitTestRanges(document, matches, 1, 1, () => true)).toBeDefined();

    delete doc.caretRangeFromPoint;
    doc.caretPositionFromPoint = () => ({ offsetNode: text, offset: 1 });
    expect(hitTestRanges(document, matches, 1, 1, () => true)?.text).toBe('cat');
    doc.caretPositionFromPoint = () => null;
    expect(hitTestRanges(document, matches, 1, 1, () => true)).toBeDefined();
    delete doc.caretPositionFromPoint;

    expect(hitTestRanges(document, matches, 1, 1, () => false)).toBeUndefined();
    expect(hitTestRanges(document, matches, 999, 1, () => true)).toBeUndefined();
  });
});

describe('connectSearchInput', () => {
  function setup(extra: object = {}) {
    const el = root('red fox, red hen, blue fox');
    const h = highlighter(el);
    const input = document.createElement('input');
    document.body.append(input);
    const changes: Array<[number, number]> = [];
    const conn = connectSearchInput(input, h, {
      debounce: 0,
      scroll: false,
      onChange: (s: { total: number; position: number }) =>
        void changes.push([s.total, s.position]),
      ...extra,
    } as never);
    cleanup.push(() => conn.disconnect());
    return { h, input, conn, changes };
  }
  const type = async (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 5));
  };
  const key = (input: HTMLInputElement, k: string, shift = false) =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, shiftKey: shift, cancelable: true })
    );

  it('highlights while typing, steps with Enter / Shift+Enter, resets on Escape', async () => {
    const { h, input, changes } = setup();
    await type(input, 'red');
    expect(h.getMatches('search')).toHaveLength(2);
    expect(h.current?.start).toBe(0);
    key(input, 'Enter');
    expect(h.current?.text).toBe('red');
    expect(h.current?.start).toBeGreaterThan(0);
    key(input, 'Enter', true);
    expect(h.current?.start).toBe(0);
    key(input, 'Escape');
    expect(input.value).toBe('');
    expect(h.getMatches('search')).toHaveLength(0);
    expect(changes.at(-1)![0]).toBe(0);
  });

  it('supports phrase mode, next/previous/refresh/reset and disconnect', async () => {
    const { h, input, conn } = setup({ mode: 'phrase' });
    await type(input, 'red fox');
    expect(h.getMatches('search')).toHaveLength(1);
    conn.next();
    conn.previous();
    conn.refresh();
    expect(h.getMatches('search')).toHaveLength(1);
    conn.reset();
    expect(h.getMatches('search')).toHaveLength(0);
    conn.disconnect();
    await type(input, 'red');
    expect(h.getMatches('search')).toHaveLength(0);
  });

  it('does nothing on Enter in a textarea and ignores IME composition', () => {
    const el = root('red');
    const h = highlighter(el);
    const area = document.createElement('textarea');
    document.body.append(area);
    const conn = connectSearchInput(area, h, { debounce: 0 });
    area.value = 'red';
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(h.getMatches('search')).toHaveLength(0);
    const ime = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, cancelable: true });
    area.dispatchEvent(ime);
    expect(ime.defaultPrevented).toBe(false);
    conn.disconnect();
  });

  it('picks up an initial value and reuses an existing group', () => {
    const el = root('red fox');
    const h = highlighter(el, { groups: [{ name: 'search', terms: [] }] });
    const input = document.createElement('input');
    input.value = 'fox';
    const conn = connectSearchInput(input, h, { debounce: 0, style: { color: 'red' } } as never);
    expect(h.getMatches('search')).toHaveLength(1);
    conn.disconnect();
  });

  it('step() on an empty result set only reports', () => {
    const { conn, changes } = setup();
    conn.next();
    expect(changes.at(-1)).toEqual([0, 0]);
  });
});

describe('utils', () => {
  it('camelToKebab handles vendor prefixes', () => {
    expect(camelToKebab('backgroundColor')).toBe('background-color');
    expect(camelToKebab('msTransform')).toBe('ms-transform');
  });

  it('cssEscapeIdent falls back when CSS.escape is missing', () => {
    const css = (globalThis as any).CSS;
    const saved = css?.escape;
    (globalThis as any).CSS = { ...(css ?? {}), escape: undefined };
    try {
      expect(cssEscapeIdent('a b')).toBe('a\\20 b');
      expect(cssEscapeIdent('1a')).toBe('\\31 a');
      expect(cssEscapeIdent('-1a')).toBe('-\\31 a');
      expect(cssEscapeIdent('ok_name-1')).toBe('ok_name-1');
    } finally {
      (globalThis as any).CSS = css;
      if (css) css.escape = saved;
    }
  });

  it('findScrollParent finds the nearest scrollable ancestor', () => {
    const outer = root('<div id="s" style="overflow-y:auto"><p id="p">x</p></div>');
    const s = outer.querySelector('#s') as HTMLElement;
    Object.defineProperty(s, 'scrollHeight', { value: 500 });
    Object.defineProperty(s, 'clientHeight', { value: 100 });
    expect(findScrollParent(outer.querySelector('#p'))).toBe(s);
    expect(findScrollParent(null)).toBeUndefined();
    expect(findScrollParent(document.documentElement)).toBeUndefined();
  });

  it('scrollRectToCenter scrolls the container, then the window when needed', () => {
    const outer = root('<div id="s" style="overflow-y:auto"><p id="p">x</p></div>');
    const s = outer.querySelector('#s') as HTMLElement;
    Object.defineProperty(s, 'scrollHeight', { value: 500 });
    Object.defineProperty(s, 'clientHeight', { value: 100 });
    s.scrollTo = vi.fn() as never;
    s.getBoundingClientRect = () => ({ top: -5000 }) as DOMRect;
    const win = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const rect = { top: 2000, height: 10 } as DOMRect;
    scrollRectToCenter(outer.querySelector('#p')!, rect, 'auto');
    expect(s.scrollTo).toHaveBeenCalled();
    expect(win).toHaveBeenCalled();
  });

  it('scrollRectToCenter scrolls the window when there is no container and swallows errors', () => {
    const el = root('x');
    const win = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      throw new Error('not implemented');
    });
    expect(() => scrollRectToCenter(el, { top: 10, height: 2 } as DOMRect, 'smooth')).not.toThrow();
    expect(win).toHaveBeenCalled();
  });

  it('debounce coalesces calls and can be cancelled', async () => {
    const fn = vi.fn();
    const micro = debounce(fn, 0);
    micro();
    micro();
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
    micro();
    micro.cancel();
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    const timed = debounce(fn, 50);
    timed();
    vi.advanceTimersByTime(30);
    timed();
    vi.advanceTimersByTime(30);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30);
    expect(fn).toHaveBeenCalledTimes(2);
    timed();
    timed.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
