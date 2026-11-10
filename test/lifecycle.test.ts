import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { createHighlighter } from '../src/index.js';
import type { Highlighter } from '../src/index.js';
import {
  installFakeHighlightApi,
  uninstallFakeHighlightApi,
  type FakeHighlightRegistry,
} from './helpers/fakeHighlightApi.js';

let registry: FakeHighlightRegistry;
const live: Highlighter[] = [];

function root(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}
function make(options: Parameters<typeof createHighlighter>[0]): Highlighter {
  const h = createHighlighter({ strategy: 'css-highlight', ...options });
  live.push(h);
  return h;
}
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const styleCount = (): number => document.head.querySelectorAll('style[data-th-instance]').length;

beforeEach(() => {
  registry = installFakeHighlightApi();
});
afterEach(() => {
  live.splice(0).forEach((h) => h.destroy());
  uninstallFakeHighlightApi();
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-th-instance]').forEach((s) => s.remove());
});

describe('destroy()', () => {
  it('removes registry entries, the style tag and the observer, and is idempotent', async () => {
    const el = root('cat dog');
    const h = make({ root: el, autoUpdate: true, groups: [{ name: 'a', terms: ['cat'] }] });
    h.next();
    expect(registry.size).toBeGreaterThan(0);
    expect(styleCount()).toBe(1);

    h.destroy();
    expect(registry.size).toBe(0);
    expect(styleCount()).toBe(0);
    expect(() => h.destroy()).not.toThrow();

    el.append(' cat');
    await flush();
    expect(registry.size).toBe(0);
  });

  it('stops pointer listeners from calling callbacks', () => {
    const el = root('cat');
    let clicks = 0;
    const h = make({
      root: el,
      groups: [{ name: 'a', terms: ['cat'] }],
      onHighlightClick: () => void (clicks += 1),
    });
    h.destroy();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks).toBe(0);
  });

  it('cancels a pending debounced auto-update', async () => {
    const el = root('cat');
    let updates = 0;
    const h = make({
      root: el,
      autoUpdate: { debounce: 20 },
      groups: [{ name: 'a', terms: ['cat'] }],
      onUpdate: () => void (updates += 1),
    });
    const before = updates;
    el.append(' cat');
    h.destroy();
    await new Promise((r) => setTimeout(r, 60));
    expect(updates).toBe(before);
    expect(registry.size).toBe(0);
  });

  it('turns every API call after destroy into a defined no-op / empty result', () => {
    const el = root('cat dog');
    const h = make({ root: el, groups: [{ name: 'a', terms: ['cat'] }] });
    h.destroy();
    expect(() => {
      h.update();
      h.setTerms('a', ['dog']);
      h.setTerms('new', ['dog']);
      h.addGroup({ name: 'b', terms: ['dog'] });
      h.updateGroup('a', { terms: ['dog'] });
      h.clear();
      h.toggleGroup('a');
      h.toggleAll();
      h.showOnly('a');
      h.showAll();
      h.clearCurrent();
    }).not.toThrow();
    expect(h.removeGroup('a')).toBe(false);
    expect(h.next()).toBeUndefined();
    expect(h.previous()).toBeUndefined();
    expect(h.goTo(0)).toBeUndefined();
    expect(h.getMatchAt(0, 0)).toBeUndefined();
    expect(h.getMatches()).toEqual([]);
    expect(h.getGroups()).toEqual([]);
    expect(h.getStats().total).toBe(0);
    expect(h.isGroupVisible('a')).toBe(false);
    expect(h.current).toBeUndefined();
    expect(registry.size).toBe(0);
    expect(styleCount()).toBe(0);
  });

  it('does not leak registry entries or style tags over many create/destroy cycles', () => {
    const el = root('cat dog '.repeat(50));
    for (let i = 0; i < 200; i++) {
      const h = make({
        root: el,
        autoUpdate: true,
        groups: [
          { name: 'a', terms: ['cat'] },
          { name: 'b', terms: ['dog'] },
        ],
      });
      h.next();
      h.destroy();
    }
    expect(registry.size).toBe(0);
    expect(styleCount()).toBe(0);
  });

  it('works for dom-span too: destroy restores the original DOM', () => {
    const el = root('a <b>cat</b> and dog');
    const original = el.innerHTML;
    const h = make({
      root: el,
      strategy: 'dom-span',
      groups: [{ name: 'a', terms: ['cat', 'dog'] }],
    });
    expect(el.querySelectorAll('mark').length).toBeGreaterThan(0);
    h.destroy();
    expect(el.innerHTML).toBe(original);
    expect(styleCount()).toBe(0);
  });
});

describe('removed / detached roots', () => {
  it('paints nothing and keeps no registry entries once the root is removed', async () => {
    const el = root('cat');
    const h = make({ root: el, autoUpdate: true, groups: [{ name: 'a', terms: ['cat'] }] });
    expect(h.getMatches()).toHaveLength(1);

    el.remove();
    h.update();
    expect(h.getMatches()).toHaveLength(0);
    expect(Array.from(registry.map.values()).every((hl) => hl.size === 0)).toBe(true);

    document.body.appendChild(el);
    h.update();
    expect(h.getMatches()).toHaveLength(1);
  });

  it('can still be destroyed after the root was removed', () => {
    const el = root('cat');
    const h = make({ root: el, groups: [{ name: 'a', terms: ['cat'] }] });
    el.remove();
    h.destroy();
    expect(registry.size).toBe(0);
    expect(styleCount()).toBe(0);
  });

  it('releases the root and callbacks held by a destroyed instance', () => {
    const el = root('cat');
    const h = make({
      root: el,
      groups: [{ name: 'a', terms: ['cat'] }],
      onUpdate: () => {},
    });
    h.destroy();
    const internal = h as unknown as Record<string, unknown>;
    expect(internal.root).toBeUndefined();
    expect(internal.options).toEqual({});
    expect(internal.matches).toEqual([]);
  });
});

describe('invalid configuration', () => {
  const group = { name: 'a', terms: ['cat'] };
  it.each([
    ['missing root', { groups: [group] }],
    ['null root', { root: null, groups: [group] }],
    ['non-element root', { root: document.createTextNode('x'), groups: [group] }],
    ['missing groups', { root: document.createElement('div') }],
    ['no group name', { root: document.createElement('div'), groups: [{ terms: ['a'] }] }],
    ['bad terms', { root: document.createElement('div'), groups: [{ name: 'a', terms: 'cat' }] }],
    ['numeric term', { root: document.createElement('div'), groups: [{ name: 'a', terms: [42] }] }],
    [
      'bad priority',
      { root: document.createElement('div'), groups: [{ ...group, priority: NaN }] },
    ],
    [
      'bad wholeWord',
      { root: document.createElement('div'), groups: [{ ...group, wholeWord: 'yes' }] },
    ],
  ])('throws a TypeError for %s', (_label, options) => {
    expect(() => createHighlighter(options as never)).toThrow(TypeError);
    expect(registry.size).toBe(0);
    expect(styleCount()).toBe(0);
  });

  it('rejects patterns that cannot be combined (duplicate named groups)', () => {
    const el = root('xy');
    expect(() =>
      createHighlighter({
        root: el,
        strategy: 'css-highlight',
        groups: [{ name: 'a', terms: [/(?<n>x)/, /(?<n>y)/] }],
      })
    ).toThrow(/cannot be compiled/);
    expect(registry.size).toBe(0);
    expect(styleCount()).toBe(0);
  });

  it('throws a clear error when css-highlight is forced without browser support', () => {
    uninstallFakeHighlightApi();
    expect(() =>
      createHighlighter({
        root: root('cat'),
        strategy: 'css-highlight',
        groups: [group],
      })
    ).toThrow(/not available/);
    expect(styleCount()).toBe(0);
  });
});

describe('multiple instances', () => {
  it('keeps instances on separate roots independent, even with identical group names', () => {
    const r1 = root('cat cat');
    const r2 = root('cat dog dog');
    const a = make({ root: r1, groups: [{ name: 'x', terms: ['cat'], priority: 1 }] });
    const b = make({ root: r2, groups: [{ name: 'x', terms: ['dog'], priority: 2 }] });
    expect(a.getMatches()).toHaveLength(2);
    expect(b.getMatches()).toHaveLength(2);
    expect(registry.size).toBe(2);
    const keys = Array.from(registry.map.keys());
    expect(new Set(keys).size).toBe(2);

    a.setTerms('x', ['nothing']);
    expect(b.getMatches()).toHaveLength(2);
    expect(Array.from(registry.map.values()).some((h) => h.size === 2)).toBe(true);

    a.destroy();
    expect(registry.size).toBe(1);
    expect(b.getMatches()).toHaveLength(2);
    b.next();
    expect(b.current?.text).toBe('dog');

    b.destroy();
    expect(registry.size).toBe(0);
    expect(styleCount()).toBe(0);
  });

  it('handles several groups across several instances without cross-talk', () => {
    const roots = [root('a b c'), root('b c d'), root('c d e')];
    const hs = roots.map((r) =>
      make({
        root: r,
        groups: [
          { name: 'one', terms: ['a', 'b'] },
          { name: 'two', terms: ['c', 'd', 'e'] },
        ],
      })
    );
    expect(hs.map((h) => h.getStats().byGroup)).toEqual([
      { one: 2, two: 1 },
      { one: 1, two: 2 },
      { one: 0, two: 3 },
    ]);
    hs[1]!.toggleGroup('one', false);
    expect(hs[0]!.isGroupVisible('one')).toBe(true);
    expect(hs[1]!.isGroupVisible('one')).toBe(false);
    hs[1]!.removeGroup('two');
    expect(hs[0]!.getStats().byGroup.two).toBe(1);
    // 6 groups registered, minus the hidden one, minus the removed one.
    expect(registry.size).toBe(4);
  });

  it('hands out unique ids even if the module-level state is reset (duplicate copies)', async () => {
    const r1 = root('cat');
    const a = make({ root: r1, groups: [{ name: 'g', terms: ['cat'] }] });
    const copy = await import('../src/utils.js?second-copy' as string);
    const idA = (a as unknown as { ctx: { instanceId: string } }).ctx.instanceId;
    expect(copy.nextInstanceId()).not.toBe(idA);
  });
});

describe('failure atomicity', () => {
  it('rolls back to the previous groups when a replacement cannot compile', () => {
    const el = root('cat dog');
    const h = make({ root: el, groups: [{ name: 'a', terms: ['cat'] }] });
    expect(() => h.addGroup({ name: 'bad', terms: [/(?<n>x)/, /(?<n>y)/] })).toThrow(TypeError);
    expect(h.getGroups().map((g) => g.name)).toEqual(['a']);
    expect(h.getMatches()).toHaveLength(1);
    expect(registry.size).toBe(1);

    expect(() => h.updateGroup('a', { terms: [/(?<n>x)/, /(?<n>y)/] })).toThrow(TypeError);
    expect(h.getGroups()[0]!.terms).toEqual(['cat']);
    expect(h.getMatches()).toHaveLength(1);
  });

  it('throws for unknown groups in updateGroup and keeps state', () => {
    const h = make({ root: root('cat'), groups: [{ name: 'a', terms: ['cat'] }] });
    expect(() => h.updateGroup('nope', { terms: [] })).toThrow(/no group named/);
    expect(h.getMatches()).toHaveLength(1);
  });
});
