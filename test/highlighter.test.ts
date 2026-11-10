import { describe, it, expect, afterEach } from 'vitest';
import { createHighlighter } from '../src/index.js';
import type { Highlighter } from '../src/index.js';
import { installFakeHighlightApi, uninstallFakeHighlightApi } from './helpers/fakeHighlightApi.js';

let active: Highlighter | undefined;

function root(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  active?.destroy();
  active = undefined;
  uninstallFakeHighlightApi();
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-th-instance]').forEach((s) => s.remove());
});

describe('strategy resolution', () => {
  it("falls back to 'none' (no DOM changes) when the CSS Highlight API is absent", () => {
    const el = root('cat');
    active = createHighlighter({ root: el, groups: [{ name: 'c', terms: ['cat'] }] });
    expect(active.activeStrategy).toBe('none');
    expect(active.getMatches()).toHaveLength(1);
    expect(el.innerHTML).toBe('cat');
    expect(document.querySelector('mark')).toBeNull();
  });

  it("uses dom-span only when fallback: 'dom-span' is requested", () => {
    active = createHighlighter({
      root: root('cat'),
      fallback: 'dom-span',
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    expect(active.activeStrategy).toBe('dom-span');
  });

  it('auto-selects css-highlight when the API is available', () => {
    installFakeHighlightApi();
    active = createHighlighter({ root: root('cat'), groups: [{ name: 'c', terms: ['cat'] }] });
    expect(active.activeStrategy).toBe('css-highlight');
  });

  it('honors an explicit strategy override', () => {
    installFakeHighlightApi();
    active = createHighlighter({
      root: root('cat'),
      strategy: 'dom-span',
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    expect(active.activeStrategy).toBe('dom-span');
  });
});

describe('input validation', () => {
  it('throws when root is not an element', () => {
    expect(() => createHighlighter({ root: null as unknown as HTMLElement, groups: [] })).toThrow(
      TypeError
    );
  });

  it('throws when groups is not an array', () => {
    expect(() => createHighlighter({ root: root('x'), groups: null as unknown as [] })).toThrow(
      TypeError
    );
  });
});

describe('getMatches', () => {
  it('filters by group name', () => {
    active = createHighlighter({
      root: root('cat dog cat'),
      strategy: 'dom-span',
      groups: [
        { name: 'cats', terms: ['cat'] },
        { name: 'dogs', terms: ['dog'] },
      ],
    });
    expect(active.getMatches().length).toBe(3);
    expect(active.getMatches('cats').length).toBe(2);
    expect(active.getMatches('dogs').length).toBe(1);
  });
});

describe('autoUpdate', () => {
  it('re-runs matching when the root subtree mutates', async () => {
    const el = root('one cat');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      autoUpdate: true,
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    expect(el.querySelectorAll('mark').length).toBe(1);

    el.appendChild(document.createTextNode(' plus a cat'));
    await flush();

    expect(el.querySelectorAll('mark').length).toBe(2);
  });

  it('does not observe when autoUpdate is off', async () => {
    const el = root('one cat');
    active = createHighlighter({
      root: el,
      strategy: 'dom-span',
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    el.appendChild(document.createTextNode(' plus a cat'));
    await flush();
    // Still 1 until update() is called explicitly.
    expect(el.querySelectorAll('mark').length).toBe(1);
  });
});

describe('strategy equivalence (shared feature surface)', () => {
  const html = 'the <b>cat</b> chased the dog and the cat ran';
  const groups = [
    { name: 'cats', terms: ['cat'] },
    { name: 'dogs', terms: ['dog'] },
  ];

  function matchesShape(h: Highlighter): Array<[string, number, number]> {
    return h.getMatches().map((m) => [m.group, m.start, m.end]);
  }

  it('produces identical match sets under both strategies', () => {
    const domH = createHighlighter({ root: root(html), strategy: 'dom-span', groups });
    installFakeHighlightApi();
    const cssH = createHighlighter({ root: root(html), strategy: 'css-highlight', groups });

    expect(matchesShape(domH)).toEqual(matchesShape(cssH));

    // Navigation returns matches in the same order for both.
    expect(domH.next()?.index).toBe(cssH.next()?.index);
    expect(domH.next()?.index).toBe(cssH.next()?.index);

    // showOnly + getMatches parity.
    domH.showOnly('cats');
    cssH.showOnly('cats');
    expect(domH.getMatches('cats').length).toBe(cssH.getMatches('cats').length);

    domH.destroy();
    cssH.destroy();
  });
});
