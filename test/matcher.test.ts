import { describe, it, expect } from 'vitest';
import { escapeRegExp, buildGroupRegExp, buildTextModel, computeMatches } from '../src/matcher.js';
import type { HighlightGroup } from '../src/types.js';

function root(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe('escapeRegExp', () => {
  it('escapes all regex metacharacters', () => {
    expect(escapeRegExp('a.b*c+?^${}()|[]\\')).toBe(
      'a\\.b\\*c\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\'
    );
  });

  it('makes a literal term match only itself', () => {
    const re = new RegExp(escapeRegExp('a.b'));
    expect(re.test('a.b')).toBe(true);
    expect(re.test('axb')).toBe(false);
  });
});

describe('buildGroupRegExp', () => {
  it('builds a case-insensitive global pattern by default', () => {
    const re = buildGroupRegExp({ name: 'g', terms: ['foo'] })!;
    expect(re.flags).toContain('g');
    expect(re.flags).toContain('i');
  });

  it('respects caseSensitive', () => {
    const re = buildGroupRegExp({ name: 'g', terms: ['foo'], caseSensitive: true })!;
    expect(re.flags).not.toContain('i');
  });

  it('combines string, string[], and RegExp terms with alternation', () => {
    const re = buildGroupRegExp({ name: 'g', terms: ['a', ['b', 'c'], /d\d/] })!;
    expect('a b c d5'.match(re)?.length).toBe(4);
  });

  it('escapes literal terms', () => {
    const re = buildGroupRegExp({ name: 'g', terms: ['a.b'] })!;
    expect(re.test('a.b')).toBe(true);
    expect(re.test('axb')).toBe(false);
  });

  it('wraps in word boundaries when wholeWord is set', () => {
    const re = buildGroupRegExp({ name: 'g', terms: ['cat'], wholeWord: true })!;
    expect('cat'.match(re)?.length).toBe(1);
    expect('cats'.match(re)).toBeNull();
  });

  it('returns undefined when there are no usable terms', () => {
    expect(buildGroupRegExp({ name: 'g', terms: [''] })).toBeUndefined();
    expect(buildGroupRegExp({ name: 'g', terms: [] })).toBeUndefined();
  });
});

describe('buildTextModel', () => {
  it('skips script, style, and noscript content', () => {
    const el = root('a<script>SCRIPT</script><style>STYLE</style><noscript>NO</noscript>b');
    const model = buildTextModel(el);
    expect(model.text).toBe('ab');
  });

  it('concatenates text across inline elements', () => {
    const el = root('hello <b>world</b>!');
    const model = buildTextModel(el);
    expect(model.text).toBe('hello world!');
    expect(model.segments.length).toBe(3);
  });

  it('produces an empty model for an empty root', () => {
    const el = root('');
    const model = buildTextModel(el);
    expect(model.text).toBe('');
    expect(model.segments).toEqual([]);
  });
});

describe('computeMatches', () => {
  const groups = (g: HighlightGroup[]): HighlightGroup[] => g;

  it('finds simple matches with correct offsets and text', () => {
    const el = root('the cat sat on the cat');
    const { matches } = computeMatches(el, groups([{ name: 'a', terms: ['cat'] }]), 'priority');
    expect(matches.map((m) => m.text)).toEqual(['cat', 'cat']);
    expect(matches[0]!.start).toBe(4);
    expect(matches[1]!.start).toBe(19);
    expect(matches.map((m) => m.index)).toEqual([0, 1]);
  });

  it('matches a phrase spanning multiple inline elements', () => {
    const el = root('say <i>hello</i> <b>world</b> now');
    const { matches } = computeMatches(
      el,
      groups([{ name: 'a', terms: ['hello world'] }]),
      'priority'
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.range.toString()).toBe('hello world');
  });

  it('returns no matches for whitespace-only or non-matching roots', () => {
    expect(
      computeMatches(root('   \n  '), groups([{ name: 'a', terms: ['x'] }]), 'priority').matches
    ).toHaveLength(0);
    expect(
      computeMatches(root('abc'), groups([{ name: 'a', terms: ['z'] }]), 'priority').matches
    ).toHaveLength(0);
    expect(
      computeMatches(root(''), groups([{ name: 'a', terms: ['a'] }]), 'priority').matches
    ).toHaveLength(0);
  });

  it('supports RegExp terms', () => {
    const el = root('a12 b345 c6');
    const { matches } = computeMatches(el, groups([{ name: 'n', terms: [/\d+/] }]), 'priority');
    expect(matches.map((m) => m.text)).toEqual(['12', '345', '6']);
  });

  it('honors wholeWord', () => {
    const el = root('cat cats scatter');
    const { matches } = computeMatches(
      el,
      groups([{ name: 'a', terms: ['cat'], wholeWord: true }]),
      'priority'
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]!.start).toBe(0);
  });

  it('sorts matches in document order across groups', () => {
    const el = root('alpha beta gamma');
    const { matches } = computeMatches(
      el,
      groups([
        { name: 'g2', terms: ['gamma'] },
        { name: 'g1', terms: ['alpha'] },
        { name: 'gm', terms: ['beta'] },
      ]),
      'allow-overlap'
    );
    expect(matches.map((m) => m.text)).toEqual(['alpha', 'beta', 'gamma']);
  });

  describe('overlap resolution', () => {
    const overlapping = (): HighlightGroup[] => [
      { name: 'A', terms: ['abc'], priority: 1 },
      { name: 'B', terms: ['cde'], priority: 5 },
    ];

    it('allow-overlap keeps both', () => {
      const { matches } = computeMatches(root('abcdef'), overlapping(), 'allow-overlap');
      expect(matches.map((m) => m.text).sort()).toEqual(['abc', 'cde']);
    });

    it('first-match keeps the earliest-starting match', () => {
      const { matches } = computeMatches(root('abcdef'), overlapping(), 'first-match');
      expect(matches.map((m) => m.text)).toEqual(['abc']);
    });

    it('priority keeps the higher-priority match', () => {
      const { matches } = computeMatches(root('abcdef'), overlapping(), 'priority');
      expect(matches.map((m) => m.text)).toEqual(['cde']);
    });
  });

  it('handles very long content (perf sanity)', () => {
    const el = root('lorem ipsum dolor sit amet needle '.repeat(5000));
    const start = performance.now();
    const { matches } = computeMatches(el, groups([{ name: 'a', terms: ['needle'] }]), 'priority');
    const elapsed = performance.now() - start;
    expect(matches).toHaveLength(5000);
    expect(elapsed).toBeLessThan(2000);
  });
});
