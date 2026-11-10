import { describe, it, expect, afterEach } from 'vitest';
import { computeMatches, createHighlighter, foldDiacritics } from '../src/index.js';
import { resolveOverlaps } from '../src/matcher.js';
import { styleToCssText, isSafeDeclaration } from '../src/utils.js';

function root(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}
afterEach(() => {
  document.body.innerHTML = '';
});

const find = (
  el: HTMLElement,
  terms: Array<string | RegExp>,
  extra: object = {},
  opts: object = {}
) => computeMatches(el, [{ name: 'g', terms, ...extra }], 'priority', opts).matches;

describe('DOM structure', () => {
  it('matches across nested inline elements and reports the original text', () => {
    const el = root('<p>say <b>hel<i>lo</i></b> <u>wor</u>ld</p>');
    const [m] = find(el, ['hello world']);
    expect(m!.text).toBe('hello world');
    expect(m!.range.toString()).toBe('hello world');
  });

  it('ignores comments, empty elements and script/style/noscript/textarea', () => {
    const el = root(
      '<span></span><!-- cat --><script>cat</script><style>cat{}</style><noscript>cat</noscript><textarea>cat</textarea>cat'
    );
    expect(find(el, ['cat'])).toHaveLength(1);
  });

  it('honours the exclude selector but never excludes the root itself', () => {
    const el = root('<code>cat</code> cat <i class="skip">cat</i>');
    el.classList.add('skip');
    expect(find(el, ['cat'], {}, { exclude: 'code, .skip' })).toHaveLength(1);
  });

  it('does not treat markup in a search term as HTML', () => {
    const el = root('<b>x</b> &lt;b&gt;x&lt;/b&gt;');
    const before = el.innerHTML;
    const matches = find(el, ['<b>x</b>']);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.text).toBe('<b>x</b>');
    expect(el.innerHTML).toBe(before);
  });

  it('treats literal regex metacharacters literally', () => {
    const el = root('a.b a+b (a|b) [x] a\\b');
    expect(find(el, ['a.b', 'a+b', '(a|b)', '[x]', 'a\\b']).map((m) => m.text)).toEqual([
      'a.b',
      'a+b',
      '(a|b)',
      '[x]',
      'a\\b',
    ]);
    expect(find(root('axb'), ['a.b'])).toHaveLength(0);
  });

  it('finds nothing in dynamically emptied roots and picks up inserted nodes on update()', () => {
    const el = root('<p>cat</p>');
    const h = createHighlighter({
      root: el,
      strategy: 'none',
      groups: [{ name: 'g', terms: ['cat'] }],
    });
    el.querySelector('p')!.remove();
    h.update();
    expect(h.getMatches()).toHaveLength(0);
    el.insertAdjacentHTML('beforeend', '<p>cat</p><p>cat</p>');
    h.update();
    expect(h.getMatches()).toHaveLength(2);
    h.destroy();
  });

  it('works on a detached subtree with the none strategy', () => {
    const el = document.createElement('div');
    el.textContent = 'cat';
    const h = createHighlighter({
      root: el,
      strategy: 'none',
      groups: [{ name: 'g', terms: ['cat'] }],
    });
    expect(h.getMatches()).toHaveLength(1);
    h.destroy();
  });
});

describe('block boundaries', () => {
  const html = '<p>foo</p><p>bar</p>';
  it('default: matches may cross blocks (backward compatible)', () => {
    expect(find(root(html), ['foobar'])).toHaveLength(1);
  });
  it('blockBoundaries: a match cannot span blocks', () => {
    expect(find(root(html), ['foobar'], {}, { blockBoundaries: true })).toHaveLength(0);
    expect(find(root(html), ['foo', 'bar'], {}, { blockBoundaries: true })).toHaveLength(2);
  });
  it('blockBoundaries: inline elements and phrases inside a block still match', () => {
    const el = root('<p>big <b>red</b> fox</p><div>big</div><div>red fox</div>');
    const m = find(el, ['big red fox', 'red fox'], {}, { blockBoundaries: true });
    expect(m.map((x) => x.text)).toEqual(['big red fox', 'red fox']);
  });
  it('blockBoundaries: regexes matching whitespace do not swallow the virtual break', () => {
    const el = root('<div>one</div><div>two</div>');
    const m = computeMatches(el, [{ name: 'g', terms: [/\s*two/] }], 'priority', {
      blockBoundaries: true,
    }).matches;
    expect(m.map((x) => x.text)).toEqual(['two']);
    expect(
      computeMatches(el, [{ name: 'g', terms: [/one\s*two/] }], 'priority', {
        blockBoundaries: true,
      }).matches
    ).toHaveLength(0);
  });
  it('blockBoundaries: wholeWord sees the block edge as a boundary', () => {
    const el = root('<p>foo</p><p>bar</p>');
    expect(find(el, ['bar'], { wholeWord: 'unicode' }, { blockBoundaries: true })).toHaveLength(1);
  });
  it('is wired through createHighlighter', () => {
    const h = createHighlighter({
      root: root(html),
      strategy: 'none',
      blockBoundaries: true,
      groups: [{ name: 'g', terms: ['foobar'] }],
    });
    expect(h.getMatches()).toHaveLength(0);
    h.destroy();
  });
});

describe('Unicode', () => {
  const textOf = (m: { range: Range }): string => m.range.toString();

  it('produces valid UTF-16 offsets around emoji and surrogate pairs', () => {
    const el = root('😀 cat 👍🏽 cat 😀cat');
    const m = find(el, ['cat']);
    expect(m).toHaveLength(3);
    for (const x of m) {
      expect(el.textContent!.slice(x.start, x.end)).toBe('cat');
      expect(textOf(x)).toBe('cat');
    }
  });

  it('matches emoji terms and keeps surrogate pairs whole', () => {
    const el = root('a 👍 b 👍🏽');
    const m = find(el, ['👍']);
    expect(m.map(textOf)).toEqual(['👍', '👍']);
  });

  it('matches non-Latin scripts', () => {
    const el = root('Привет мир, 你好世界, مرحبا, שלום, สวัสดี');
    expect(find(el, ['мир', '世界', 'مرحبا', 'שלום', 'สวัสดี']).map(textOf)).toEqual([
      'мир',
      '世界',
      'مرحبا',
      'שלום',
      'สวัสดี',
    ]);
  });

  it('case-insensitive matching works for Cyrillic, Greek and accented Latin', () => {
    const el = root('ПРИВЕТ ΣΟΦΟΣ ÉCOLE');
    expect(find(el, ['привет', 'σοφοσ', 'école']).map(textOf)).toEqual([
      'ПРИВЕТ',
      'ΣΟΦΟΣ',
      'ÉCOLE',
    ]);
    expect(find(el, ['привет'], { caseSensitive: true })).toHaveLength(0);
  });

  it('ignoreDiacritics folds precomposed accents with offsets preserved', () => {
    const el = root('Crème brûlée à la façon');
    const m = find(el, ['creme brulee', 'facon'], { ignoreDiacritics: true });
    expect(m.map(textOf)).toEqual(['Crème brûlée', 'façon']);
    expect(foldDiacritics('Crème').length).toBe('Crème'.length);
  });

  it('combining characters: decomposed text keeps its marks inside the range', () => {
    const el = root('café and cafe');
    const m = find(el, ['cafe'], { ignoreDiacritics: true });
    expect(m).toHaveLength(2);
    expect(textOf(m[0]!)).toBe('cafe');
    // wholeWord:'unicode' treats a trailing combining mark as part of the word.
    expect(find(el, ['cafe'], { wholeWord: 'unicode' }).map((x) => x.start)).toEqual([
      el.textContent!.lastIndexOf('cafe'),
    ]);
  });

  it('zero-width characters inside text prevent literal matches but never corrupt ranges', () => {
    const el = root('ca​t cat');
    const m = find(el, ['cat']);
    expect(m).toHaveLength(1);
    expect(m[0]!.start).toBe(el.textContent!.lastIndexOf('cat'));
    expect(find(el, [new RegExp('ca\\u200b?t')])).toHaveLength(2);
  });

  it('wholeWord:"unicode" respects word edges next to emoji and non-ASCII letters', () => {
    const el = root('😀cat😀 écat cat');
    const m = find(el, ['cat'], { wholeWord: 'unicode' });
    expect(m).toHaveLength(2);
  });

  it('matches spanning two text nodes with a surrogate pair split across elements', () => {
    const el = document.createElement('div');
    el.append(document.createTextNode('x😀'), document.createTextNode('y'));
    document.body.append(el);
    const m = find(el, ['😀y']);
    expect(m).toHaveLength(1);
    expect(textOf(m[0]!)).toBe('😀y');
  });
});

describe('overlap resolution and scale', () => {
  const raw = (group: string, start: number, end: number, priority = 0) => ({
    group,
    text: '',
    start,
    end,
    priority,
  });

  it('priority: higher priority wins, ties go to the earliest then longest', () => {
    const out = resolveOverlaps(
      [raw('lo', 0, 10, 1), raw('hi', 5, 8, 9), raw('lo', 20, 25, 1), raw('lo2', 22, 30, 1)],
      'priority'
    );
    expect(out.map((m) => [m.group, m.start])).toEqual([
      ['hi', 5],
      ['lo', 20],
    ]);
  });

  it('first-match and allow-overlap behave as documented', () => {
    const input = [raw('a', 0, 4), raw('b', 2, 6), raw('c', 6, 8)];
    expect(resolveOverlaps(input, 'first-match').map((m) => m.group)).toEqual(['a', 'c']);
    expect(resolveOverlaps(input, 'allow-overlap').map((m) => m.group)).toEqual(['a', 'b', 'c']);
  });

  it('agrees with a brute-force reference on random inputs', () => {
    let seed = 12345;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let round = 0; round < 200; round++) {
      const input = Array.from({ length: 40 }, (_, i) => {
        const start = rnd(100);
        return raw(`g${i}`, start, start + 1 + rnd(15), rnd(4));
      });
      const brute: ReturnType<typeof raw>[] = [];
      const sorted = [...input].sort(
        (a, b) => b.priority - a.priority || a.start - b.start || b.end - a.end
      );
      for (const c of sorted) {
        if (!brute.some((a) => a.start < c.end && c.start < a.end)) brute.push(c);
      }
      brute.sort((a, b) => a.start - b.start || a.end - b.end || a.group.localeCompare(b.group));
      expect(resolveOverlaps(input, 'priority')).toEqual(brute);
    }
  });

  it('handles 200k matches without stack overflow and in reasonable time', () => {
    const el = root('');
    el.textContent = 'a '.repeat(200_000);
    const t = performance.now();
    const m = find(el, ['a']);
    expect(m).toHaveLength(200_000);
    expect(performance.now() - t).toBeLessThan(15_000);
  }, 30_000);

  it('maxMatches caps the number of matches', () => {
    const el = root('a a a a a b b b');
    expect(find(el, ['a', 'b'], {}, { maxMatches: 3 })).toHaveLength(3);
    const two = computeMatches(
      el,
      [
        { name: 'x', terms: ['a'] },
        { name: 'y', terms: ['b'] },
      ],
      'priority',
      { maxMatches: 6 }
    ).matches;
    expect(two).toHaveLength(6);
  });
});

describe('CSS / style safety', () => {
  it('drops declarations that could break out of the generated rule', () => {
    const css = styleToCssText({
      backgroundColor: 'red; } body { display: none',
      color: 'blue',
      textDecoration: 'underline',
      // @ts-expect-error deliberately invalid
      'x}y': 'z',
      outline: 'url(javascript:alert(1)',
      border: '1px solid "red',
      boxShadow: '0 0 1px /* hi */ red',
      content: '</style><script>',
    });
    expect(css).toBe('color: blue; text-decoration: underline;');
  });

  it('accepts ordinary values', () => {
    expect(isSafeDeclaration('background-color', 'rgb(1, 2, 3)')).toBe(true);
    expect(isSafeDeclaration('text-decoration', 'underline wavy "x"')).toBe(true);
    expect(isSafeDeclaration('--custom', 'var(--x)')).toBe(true);
    expect(isSafeDeclaration('color', ')')).toBe(false);
  });

  it('a malformed style on one group cannot change another highlight rule', () => {
    const el = root('cat dog');
    (globalThis as any).Highlight = class {
      priority = 0;
      size = 0;
      add() {
        return this;
      }
      clear() {}
      delete() {
        return true;
      }
      has() {
        return false;
      }
      forEach() {}
    };
    const map = new Map();
    ((globalThis as any).CSS ??= {}).highlights = map;
    const h = createHighlighter({
      root: el,
      strategy: 'css-highlight',
      groups: [
        { name: 'a', terms: ['cat'], style: { color: 'red; } * { display:none' } },
        { name: 'b', terms: ['dog'], style: { color: 'green' } },
      ],
    });
    const css = document.head.querySelector('style[data-th-instance]')!.textContent!;
    expect(css).not.toContain('display');
    expect(css.match(/::highlight\(/g)).toHaveLength(3);
    expect(css).toContain('color: green;');
    h.destroy();
    delete (globalThis as any).Highlight;
    delete (globalThis as any).CSS.highlights;
  });

  it('group names with special characters cannot inject CSS', () => {
    const el = root('cat');
    (globalThis as any).Highlight = class {
      priority = 0;
      add() {
        return this;
      }
      clear() {}
    };
    ((globalThis as any).CSS ??= {}).highlights = new Map();
    const h = createHighlighter({
      root: el,
      strategy: 'css-highlight',
      groups: [{ name: 'x) { } body { display:none } ::highlight(y', terms: ['cat'] }],
    });
    const css = document.head.querySelector('style[data-th-instance]')!.textContent!;
    expect(css).not.toMatch(/body\s*\{/);
    h.destroy();
    delete (globalThis as any).Highlight;
    delete (globalThis as any).CSS.highlights;
  });
});
