import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHighlighter, supportsCssHighlight } from '../src/index.js';
import type { Highlighter } from '../src/index.js';
import {
  installFakeHighlightApi,
  uninstallFakeHighlightApi,
  type FakeHighlightRegistry,
} from './helpers/fakeHighlightApi.js';

let registry: FakeHighlightRegistry;
let active: Highlighter | undefined;

function root(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  registry = installFakeHighlightApi();
});

afterEach(() => {
  active?.destroy();
  active = undefined;
  uninstallFakeHighlightApi();
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-th-instance]').forEach((s) => s.remove());
});

describe('css-highlight renderer', () => {
  it('is feature-detected when the API is present', () => {
    expect(supportsCssHighlight()).toBe(true);
  });

  it('registers a Highlight per group and does not mutate the DOM', () => {
    const el = root('the cat and the dog');
    active = createHighlighter({
      root: el,
      strategy: 'css-highlight',
      groups: [
        { name: 'cats', terms: ['cat'], priority: 2 },
        { name: 'dogs', terms: ['dog'], priority: 7 },
      ],
    });
    const keys = Array.from(registry.map.keys());
    expect(keys.some((k) => k.endsWith('-g-cats'))).toBe(true);
    expect(keys.some((k) => k.endsWith('-g-dogs'))).toBe(true);
    // Priority propagated to the Highlight object.
    const dogHighlight = registry.map.get(keys.find((k) => k.endsWith('-g-dogs'))!)!;
    expect(dogHighlight.priority).toBe(7);
    // No wrapper elements were inserted.
    expect(el.querySelectorAll('mark').length).toBe(0);
    expect(el.textContent).toBe('the cat and the dog');
    // A <style> with ::highlight() rules was injected.
    const style = document.head.querySelector('style[data-th-instance]')!;
    expect(style.textContent).toContain('::highlight(');
  });

  it('toggling a group removes/re-adds its registry entry', () => {
    const el = root('cat dog');
    active = createHighlighter({
      root: el,
      strategy: 'css-highlight',
      groups: [
        { name: 'cats', terms: ['cat'] },
        { name: 'dogs', terms: ['dog'] },
      ],
    });
    const catKey = Array.from(registry.map.keys()).find((k) => k.endsWith('-g-cats'))!;
    expect(registry.has(catKey)).toBe(true);

    active.toggleGroup('cats', false);
    expect(registry.has(catKey)).toBe(false);
    // The other group is untouched.
    expect(Array.from(registry.map.keys()).some((k) => k.endsWith('-g-dogs'))).toBe(true);

    active.toggleGroup('cats', true);
    expect(registry.has(catKey)).toBe(true);
  });

  it('showOnly leaves exactly one group registered', () => {
    const el = root('cat dog bird');
    active = createHighlighter({
      root: el,
      strategy: 'css-highlight',
      groups: [
        { name: 'cats', terms: ['cat'] },
        { name: 'dogs', terms: ['dog'] },
        { name: 'birds', terms: ['bird'] },
      ],
    });
    active.showOnly('dogs');
    const groupKeys = Array.from(registry.map.keys()).filter((k) => k.includes('-g-'));
    expect(groupKeys).toHaveLength(1);
    expect(groupKeys[0]!.endsWith('-g-dogs')).toBe(true);
  });

  it('next() registers a high-priority current highlight', () => {
    const el = root('cat cat cat');
    active = createHighlighter({
      root: el,
      strategy: 'css-highlight',
      groups: [{ name: 'c', terms: ['cat'] }],
    });
    const match = active.next();
    expect(match?.index).toBe(0);
    const currentKey = Array.from(registry.map.keys()).find((k) => k.endsWith('-current'))!;
    expect(currentKey).toBeDefined();
    const current = registry.map.get(currentKey)!;
    expect(current.size).toBe(1);
    expect(current.priority).toBeGreaterThan(1000);
  });

  it('hit-tests clicks against Range.getClientRects', () => {
    const el = root('a cat here');
    const onClick = vi.fn();
    active = createHighlighter({
      root: el,
      strategy: 'css-highlight',
      groups: [{ name: 'c', terms: ['cat'] }],
      onHighlightClick: onClick,
    });
    const match = active.getMatches()[0]!;
    // jsdom's Range has no getClientRects; define one returning a fixed rect.
    (match.range as unknown as { getClientRects: () => unknown }).getClientRects = () => [
      { left: 10, top: 10, right: 60, bottom: 30 },
    ];

    // Click inside the rect.
    el.dispatchEvent(new MouseEvent('click', { clientX: 30, clientY: 20, bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]![0].text).toBe('cat');

    // Click outside the rect does nothing further.
    el.dispatchEvent(new MouseEvent('click', { clientX: 500, clientY: 500, bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('destroy() clears all registry entries and the injected style', () => {
    const el = root('cat dog');
    active = createHighlighter({
      root: el,
      strategy: 'css-highlight',
      groups: [
        { name: 'cats', terms: ['cat'] },
        { name: 'dogs', terms: ['dog'] },
      ],
    });
    active.next();
    expect(registry.size).toBeGreaterThan(0);

    active.destroy();
    active = undefined;

    expect(registry.size).toBe(0);
    expect(document.head.querySelectorAll('style[data-th-instance]').length).toBe(0);
  });
});
