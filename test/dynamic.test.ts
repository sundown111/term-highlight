import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createHighlighter } from '../src/index.js';
import type { Highlighter } from '../src/index.js';
import {
  installFakeHighlightApi,
  uninstallFakeHighlightApi,
  type FakeHighlightRegistry,
} from './helpers/fakeHighlightApi.js';

let registry: FakeHighlightRegistry;
let h: Highlighter | undefined;

function setup(html: string, extra: object = {}): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  h = createHighlighter({
    root: el,
    strategy: 'css-highlight',
    groups: [
      { name: 'a', terms: ['cat'], priority: 1 },
      { name: 'b', terms: ['dog'], priority: 2 },
    ],
    ...extra,
  });
  return el;
}
const painted = (): number =>
  Array.from(registry.map.entries())
    .filter(([k]) => !k.endsWith('-current'))
    .reduce((n, [, hl]) => n + hl.size, 0);
const rules = (): string => document.head.querySelector('style[data-th-instance]')!.textContent!;
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  registry = installFakeHighlightApi();
});
afterEach(() => {
  h?.destroy();
  h = undefined;
  uninstallFakeHighlightApi();
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-th-instance]').forEach((s) => s.remove());
});

describe('dynamic updates', () => {
  it('setTerms() repeatedly leaves no stale ranges', () => {
    setup('cat dog bird cat');
    for (const [terms, expected] of [
      [['cat'], 2],
      [['bird'], 1],
      [['zzz'], 0],
      [['cat', 'bird'], 3],
      [[], 0],
      [['cat'], 2],
    ] as const) {
      h!.setTerms('a', [...terms]);
      expect(h!.getMatches('a')).toHaveLength(expected);
      expect(painted()).toBe(expected + 1 /* dog in b */);
    }
  });

  it('setTerms() creates unknown groups', () => {
    setup('cat dog bird');
    h!.setTerms('c', ['bird']);
    expect(h!.getMatches('c')).toHaveLength(1);
    expect(h!.isGroupVisible('c')).toBe(true);
  });

  it('updateGroup() changes existing matches, style and priority', () => {
    setup('cat dog');
    h!.updateGroup('a', { terms: ['dog'], style: { color: 'rgb(1, 2, 3)' } });
    // b has higher priority, so the overlapping dog goes to b.
    expect(h!.getMatches('b')).toHaveLength(1);
    expect(h!.getMatches('a')).toHaveLength(0);
    expect(rules()).toContain('rgb(1, 2, 3)');

    h!.updateGroup('a', { priority: 10 });
    expect(h!.getMatches('a')).toHaveLength(1);
    expect(h!.getMatches('b')).toHaveLength(0);
    const keyA = Array.from(registry.map.keys()).find((k) => k.endsWith('-g-a'))!;
    expect(registry.get(keyA)!.priority).toBe(10);
  });

  it('addGroup() replaces a same-named group and removeGroup() drops its registry entry', () => {
    setup('cat dog bird');
    h!.addGroup({ name: 'c', terms: ['bird'] });
    expect(registry.size).toBe(3);
    h!.addGroup({ name: 'c', terms: ['cat'], priority: 5 });
    expect(h!.getGroups().filter((g) => g.name === 'c')).toHaveLength(1);
    expect(h!.getMatches('c')[0]!.text).toBe('cat');
    expect(h!.removeGroup('c')).toBe(true);
    expect(h!.removeGroup('c')).toBe(false);
    expect(registry.size).toBe(2);
    expect(rules()).not.toContain('-g-c');
  });

  it('clear() removes everything yet keeps the instance usable', () => {
    setup('cat dog');
    h!.next();
    h!.clear();
    expect(h!.getMatches()).toEqual([]);
    expect(painted()).toBe(0);
    expect(h!.current).toBeUndefined();
    h!.setTerms('a', ['cat']);
    expect(h!.getMatches()).toHaveLength(1);
  });

  it('hidden groups stay hidden across updates and re-adding a group keeps its visibility', () => {
    setup('cat dog');
    h!.toggleGroup('a', false);
    h!.setTerms('a', ['cat', 'dog']);
    expect(h!.isGroupVisible('a')).toBe(false);
    const keyA = Array.from(registry.map.keys()).find((k) => k.endsWith('-g-a'));
    expect(keyA).toBeUndefined();
  });

  it('keeps the current match when an update does not move it', () => {
    setup('cat dog cat');
    h!.next();
    h!.next();
    const cur = h!.current!;
    h!.setTerms('b', ['dog', 'zzz']);
    expect(h!.current?.start).toBe(cur.start);
  });

  it('multiple simultaneous group updates in a row stay consistent', () => {
    setup('cat dog bird fish');
    h!.updateGroup('a', { terms: ['bird'] });
    h!.updateGroup('b', { terms: ['fish'] });
    h!.addGroup({ name: 'c', terms: ['cat', 'dog'] });
    expect(h!.getStats()).toMatchObject({ total: 4, byGroup: { a: 1, b: 1, c: 2 } });
    expect(painted()).toBe(4);
  });
});

describe('autoUpdate with DOM mutations', () => {
  it('re-highlights inserted text and drops removed text', async () => {
    const el = setup('cat', { autoUpdate: true });
    expect(h!.getMatches()).toHaveLength(1);
    el.append(document.createTextNode(' dog dog'));
    await flush();
    expect(h!.getMatches()).toHaveLength(3);
    el.firstChild!.remove();
    await flush();
    expect(h!.getMatches()).toHaveLength(2);
    expect(painted()).toBe(2);
  });

  it('reacts to characterData changes', async () => {
    const el = setup('xxx', { autoUpdate: true });
    (el.firstChild as Text).data = 'cat';
    await flush();
    expect(h!.getMatches()).toHaveLength(1);
  });

  it('batches a burst of mutations into few passes (debounced)', async () => {
    let updates = 0;
    const el = setup('cat', { autoUpdate: { debounce: 15 }, onUpdate: () => void (updates += 1) });
    const base = updates;
    for (let i = 0; i < 50; i++) el.append(' cat');
    await new Promise((r) => setTimeout(r, 60));
    expect(updates - base).toBe(1);
    expect(h!.getMatches()).toHaveLength(51);
  });

  it('does not feed back on itself with the css-highlight strategy', async () => {
    let updates = 0;
    setup('cat dog', { autoUpdate: true, onUpdate: () => void (updates += 1) });
    h!.next();
    h!.toggleGroup('a', false);
    await flush();
    await flush();
    expect(updates).toBe(1);
  });

  it('does not loop with dom-span, which mutates the DOM itself', async () => {
    let updates = 0;
    const el = setup('cat dog', {
      strategy: 'dom-span',
      autoUpdate: true,
      onUpdate: () => void (updates += 1),
    });
    await flush();
    await flush();
    expect(updates).toBe(1);
    expect(el.querySelectorAll('mark')).toHaveLength(2);
    el.append(' cat');
    await flush();
    await flush();
    expect(updates).toBe(2);
    expect(el.querySelectorAll('mark')).toHaveLength(3);
  });

  it('keeps observing after update() throws mid-pass', async () => {
    const el = setup('cat', { autoUpdate: true });
    const original = (h as any).renderer.render;
    (h as any).renderer.render = () => {
      throw new Error('boom');
    };
    expect(() => h!.update()).toThrow('boom');
    (h as any).renderer.render = original;
    el.append(' cat');
    await flush();
    expect(h!.getMatches()).toHaveLength(2);
  });
});

describe('no-work fast path', () => {
  it('does not walk the DOM when there are no groups', () => {
    const el = setup('cat dog');
    h!.clear();
    const spy = vi.spyOn(document, 'createTreeWalker');
    h!.update();
    expect(spy).not.toHaveBeenCalled();
    h!.setTerms('a', ['cat']);
    expect(spy).toHaveBeenCalled();
    expect(el.textContent).toBe('cat dog');
    spy.mockRestore();
  });
});
