import { describe, it, expect, afterEach } from 'vitest';
import { createHighlighter, supportsCssHighlight } from '../src/index.js';
import {
  FakeHighlight,
  installFakeHighlightApi,
  uninstallFakeHighlightApi,
} from './helpers/fakeHighlightApi.js';

const g = globalThis as any;
afterEach(() => {
  uninstallFakeHighlightApi();
  delete g.Highlight;
  document.body.innerHTML = '';
});

describe('CSS Custom Highlight API detection', () => {
  it('is false with nothing installed', () => {
    expect(supportsCssHighlight()).toBe(false);
  });
  it('is true with a full implementation', () => {
    installFakeHighlightApi();
    expect(supportsCssHighlight()).toBe(true);
  });
  it('is false when only the constructor exists', () => {
    g.Highlight = FakeHighlight;
    expect(supportsCssHighlight()).toBe(false);
  });
  it('is false when only the registry exists', () => {
    (g.CSS ??= {}).highlights = new Map();
    expect(supportsCssHighlight()).toBe(false);
  });
  it('is false for a registry that is not Map-like', () => {
    g.Highlight = FakeHighlight;
    (g.CSS ??= {}).highlights = {};
    expect(supportsCssHighlight()).toBe(false);
  });
  it('is false for a Highlight constructor without add()', () => {
    g.Highlight = function () {};
    (g.CSS ??= {}).highlights = new Map();
    expect(supportsCssHighlight()).toBe(false);
  });
  it('auto strategy on partial support degrades to none without touching the DOM', () => {
    g.Highlight = FakeHighlight;
    const el = document.createElement('div');
    el.textContent = 'cat';
    document.body.append(el);
    const h = createHighlighter({ root: el, groups: [{ name: 'a', terms: ['cat'] }] });
    expect(h.activeStrategy).toBe('none');
    expect(h.getMatches()).toHaveLength(1);
    expect(document.head.querySelector('style[data-th-instance]')).toBeNull();
    h.destroy();
  });
});
