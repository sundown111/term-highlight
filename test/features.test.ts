import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createHighlighter,
  connectSearchInput,
  parseQuery,
  foldDiacritics,
  computeMatches,
  buildGroupRegExp,
} from '../src/index.js';
import type { Highlighter } from '../src/index.js';
import { installFakeHighlightApi, uninstallFakeHighlightApi } from './helpers/fakeHighlightApi.js';

let active: Highlighter | undefined;

function root(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

const texts = (h: Highlighter, group?: string): string[] => h.getMatches(group).map((m) => m.text);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  active?.destroy();
  active = undefined;
  uninstallFakeHighlightApi();
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-th-instance]').forEach((s) => s.remove());
});

describe('matching improvements', () => {
  it('prefers the longest literal regardless of term order', () => {
    const re = buildGroupRegExp({ name: 'g', terms: ['cat', 'category'] })!;
    expect('category'.match(re)![0]).toBe('category');
  });

  it('ignoreDiacritics matches accented text and reports the original text', () => {
    const el = root('Un café et un résumé, naïve Łódź');
    const { matches } = computeMatches(
      el,
      [{ name: 'g', terms: ['cafe', 'resume', 'naive', 'lodz'], ignoreDiacritics: true }],
      'priority'
    );
    expect(matches.map((m) => m.text)).toEqual(['café', 'résumé', 'naïve', 'Łódź']);
  });

  it('ignoreDiacritics also works when the term has accents and the text does not', () => {
    const el = root('cafe');
    const { matches } = computeMatches(
      el,
      [{ name: 'g', terms: ['café'], ignoreDiacritics: true }],
      'priority'
    );
    expect(matches).toHaveLength(1);
  });

  it('foldDiacritics preserves string length', () => {
    const s = 'Ça va? Ñandú, Øresund, straße';
    expect(foldDiacritics(s)).toHaveLength(s.length);
    expect(foldDiacritics(s)).toBe('Ca va? Nandu, Oresund, straße');
  });

  it("wholeWord: 'unicode' respects accented letters as word characters", () => {
    const el = root('café cafés écafé café');
    const ascii = computeMatches(el, [{ name: 'g', terms: ['café'], wholeWord: true }], 'priority');
    const uni = computeMatches(
      el,
      [{ name: 'g', terms: ['café'], wholeWord: 'unicode' }],
      'priority'
    );
    // ASCII \b treats "é" as a non-word char, so "écafé" is wrongly matched and
    // the trailing "é" defeats the boundary entirely.
    expect(ascii.matches.length).not.toBe(2);
    expect(uni.matches.map((m) => m.start)).toEqual([0, 17]);
  });

  it("wholeWord: 'unicode' works for Cyrillic", () => {
    const el = root('кот котик кот');
    const { matches } = computeMatches(
      el,
      [{ name: 'g', terms: ['кот'], wholeWord: 'unicode' }],
      'priority'
    );
    expect(matches.map((m) => m.start)).toEqual([0, 10]);
  });

  it('exclude skips matching subtrees, and textarea is always skipped', () => {
    const el = root('cat <code>cat</code> <span data-skip>cat</span> <textarea>cat</textarea> cat');
    active = createHighlighter({
      root: el,
      strategy: 'none',
      exclude: 'code, [data-skip]',
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    expect(active.getMatches()).toHaveLength(2);
  });
});

describe("strategy 'none' and fallback", () => {
  it("fallback: 'none' never touches the DOM when the Highlight API is missing", () => {
    const el = root('the cat sat');
    const before = el.innerHTML;
    const headBefore = document.head.innerHTML;
    active = createHighlighter({
      root: el,
      fallback: 'none',
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    expect(active.activeStrategy).toBe('none');
    expect(active.getMatches()).toHaveLength(1);
    expect(active.next()?.text).toBe('cat');
    expect(el.innerHTML).toBe(before);
    expect(document.head.innerHTML).toBe(headBefore);
  });

  it("auto still prefers css-highlight over the 'none' fallback", () => {
    installFakeHighlightApi();
    active = createHighlighter({ root: root('cat'), fallback: 'none', groups: [] });
    expect(active.activeStrategy).toBe('css-highlight');
  });
});

describe.each(['css-highlight', 'dom-span', 'none'] as const)('dynamic groups (%s)', (strategy) => {
  const make = (html: string, groups = [{ name: 'a', terms: ['cat'] }]): Highlighter => {
    if (strategy === 'css-highlight') installFakeHighlightApi();
    return createHighlighter({ root: root(html), strategy, groups });
  };

  it('setTerms replaces terms and creates missing groups', () => {
    active = make('cat dog bird');
    active.setTerms('a', ['dog']);
    expect(texts(active)).toEqual(['dog']);
    active.setTerms('b', ['bird']);
    expect(texts(active)).toEqual(['dog', 'bird']);
    expect(active.getGroups().map((g) => g.name)).toEqual(['a', 'b']);
  });

  it('removeGroup / addGroup / clear', () => {
    active = make('cat dog');
    active.addGroup({ name: 'b', terms: ['dog'] });
    expect(active.getStats().byGroup).toEqual({ a: 1, b: 1 });
    expect(active.removeGroup('a')).toBe(true);
    expect(active.removeGroup('nope')).toBe(false);
    expect(texts(active)).toEqual(['dog']);
    active.clear();
    expect(active.getMatches()).toHaveLength(0);
    active.setTerms('c', ['cat']);
    expect(texts(active)).toEqual(['cat']);
  });

  it('updateGroup changes options and throws for unknown groups', () => {
    active = make('Cat cat');
    active.updateGroup('a', { caseSensitive: true });
    expect(texts(active)).toEqual(['cat']);
    expect(() => active!.updateGroup('missing', {})).toThrow();
  });

  it('does not mutate the caller groups array', () => {
    const groups = [{ name: 'a', terms: ['cat'] }];
    if (strategy === 'css-highlight') installFakeHighlightApi();
    active = createHighlighter({ root: root('cat'), strategy, groups });
    active.addGroup({ name: 'b', terms: ['x'] });
    expect(groups).toHaveLength(1);
  });

  it('dom-span leaves no stale wrappers after group changes', () => {
    active = make('cat dog');
    active.setTerms('a', ['dog']);
    active.removeGroup('a');
    expect(document.querySelectorAll('mark').length).toBe(0);
  });
});

describe('navigation, stats, and callbacks', () => {
  it('goTo, current, clearCurrent and stats positions', () => {
    const onCurrentChange = vi.fn();
    active = createHighlighter({
      root: root('a1 a2 a3 b1'),
      strategy: 'none',
      onCurrentChange,
      groups: [
        { name: 'a', terms: [/a\d/] },
        { name: 'b', terms: [/b\d/] },
      ],
    });
    expect(active.getStats()).toEqual({
      total: 4,
      visible: 4,
      position: 0,
      byGroup: { a: 3, b: 1 },
    });
    expect(active.goTo(2)?.text).toBe('a3');
    expect(active.current?.text).toBe('a3');
    expect(active.getStats().position).toBe(3);
    expect(onCurrentChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: 'a3' }),
      expect.objectContaining({ position: 3 })
    );
    active.toggleGroup('a', false);
    // The hidden current match is dropped.
    expect(active.current).toBeUndefined();
    expect(active.goTo(0)).toBeUndefined();
    expect(active.getStats()).toMatchObject({ visible: 1, position: 0 });
    expect(active.isGroupVisible('a')).toBe(false);
    active.showAll();
    active.next();
    active.clearCurrent();
    expect(active.current).toBeUndefined();
  });

  it('keeps the current match across update() when it still exists', () => {
    const el = root('cat cat cat');
    active = createHighlighter({
      root: el,
      strategy: 'none',
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    active.next();
    active.next();
    active.update();
    expect(active.current?.start).toBe(4);
  });

  it('onUpdate fires on every pass', () => {
    const onUpdate = vi.fn();
    active = createHighlighter({
      root: root('cat'),
      strategy: 'none',
      onUpdate,
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    active.setTerms('c', ['dog']);
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate.mock.calls[1]![1].total).toBe(0);
  });

  it('autoUpdate debounce batches mutations', async () => {
    const onUpdate = vi.fn();
    const el = root('cat');
    active = createHighlighter({
      root: el,
      strategy: 'none',
      autoUpdate: { debounce: 30 },
      onUpdate,
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    el.append(' cat');
    await sleep(5);
    el.append(' cat');
    await sleep(60);
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(active.getMatches()).toHaveLength(3);
  });

  it('dom-span hover reports enter and leave (one check per frame)', async () => {
    const onHighlightHover = vi.fn();
    const el = root('the cat sat');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      onHighlightHover,
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    const mark = el.querySelector('mark')!;
    const frame = (): Promise<void> => sleep(40);
    mark.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    mark.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    await frame();
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    await frame();
    el.dispatchEvent(new MouseEvent('mouseleave'));
    // Enter once, leave once; the repeat move and the extra leave are deduped.
    expect(onHighlightHover.mock.calls.map((c) => c[0]?.text)).toEqual(['cat', undefined]);
  });

  it('dom-span ignores clicks on hidden groups', () => {
    const onHighlightClick = vi.fn();
    const el = root('cat');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      onHighlightClick,
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    active.toggleGroup('c', false);
    el.querySelector('mark')!.click();
    expect(onHighlightClick).not.toHaveBeenCalled();
  });

  it('css-highlight escapes unusual group names in the stylesheet', () => {
    installFakeHighlightApi();
    active = createHighlighter({
      root: root('cat'),
      strategy: 'css-highlight',
      groups: [{ name: 'my group!', terms: ['cat'] }],
    });
    const css = document.head.querySelector('style[data-th-instance]')!.textContent!;
    expect(css).not.toContain('my group!)');
  });
});

describe('parseQuery', () => {
  it('splits words and keeps quoted phrases', () => {
    expect(parseQuery(`red  "big fox" 'lazy dog' red RED`)).toEqual(['red', 'big fox', 'lazy dog']);
  });

  it('handles unterminated quotes and minLength', () => {
    expect(parseQuery('a "big fo', { minLength: 2 })).toEqual(['big fo']);
  });

  it('parses regex tokens only when allowed', () => {
    expect(parseQuery('/colou?r/')).toEqual(['/colou?r/']);
    const [re] = parseQuery('/colou?r/', { allowRegex: true });
    expect(re).toBeInstanceOf(RegExp);
    expect(parseQuery('/(/', { allowRegex: true })).toEqual(['/(/']);
  });
});

describe('connectSearchInput', () => {
  function setup(html = 'cat dog cat bird cat') {
    const el = root(html);
    const input = document.createElement('input');
    document.body.appendChild(input);
    active = createHighlighter({
      root: el,
      strategy: 'none',
      groups: [{ name: 'always', terms: ['bird'] }],
    });
    const onChange = vi.fn();
    const conn = connectSearchInput(input, active, { debounce: 0, onChange });
    const type = async (value: string): Promise<void> => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await sleep(0);
    };
    const key = (k: string, shiftKey = false): void => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, cancelable: true }));
    };
    return { input, conn, onChange, type, key };
  }

  it('highlights as you type and jumps to the first match', async () => {
    const { type, onChange } = setup();
    await type('cat');
    expect(texts(active!, 'search')).toEqual(['cat', 'cat', 'cat']);
    expect(active!.current?.start).toBe(0);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ total: 3, position: 1 }),
      expect.objectContaining({ text: 'cat' })
    );
    // Other groups are untouched.
    expect(texts(active!, 'always')).toEqual(['bird']);
  });

  it('Enter / Shift+Enter cycle through search matches only', async () => {
    const { type, key } = setup();
    await type('cat');
    key('Enter');
    expect(active!.current?.start).toBe(8);
    key('Enter');
    expect(active!.current?.start).toBe(17);
    key('Enter');
    expect(active!.current?.start).toBe(0);
    key('Enter', true);
    expect(active!.current?.start).toBe(17);
  });

  it('next() / previous() on the connection mirror Enter / Shift+Enter', async () => {
    const { type, conn } = setup();
    await type('cat');
    conn.next();
    expect(active!.current?.start).toBe(8);
    conn.previous();
    expect(active!.current?.start).toBe(0);
  });

  it('Escape clears the input and the search highlights', async () => {
    const { type, key, input } = setup();
    await type('dog');
    key('Escape');
    expect(input.value).toBe('');
    expect(active!.getMatches('search')).toHaveLength(0);
  });

  it('disconnect stops listening', async () => {
    const { type, conn } = setup();
    conn.disconnect();
    await type('cat');
    expect(active!.getMatches('search')).toHaveLength(0);
  });
});
