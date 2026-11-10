import type { ResolvedStrategy, Strategy } from '../types.js';
import type { Renderer, RendererContext } from './renderer.js';
import { CssHighlightRenderer } from './css-highlight.js';
import { DomSpanRenderer } from './dom-span.js';
import { NoneRenderer } from './none.js';
import { supportsCssHighlight } from '../css-highlight-api.js';

/**
 * Resolve `'auto'` to a concrete strategy via feature detection. The CSS
 * Custom Highlight API is the main strategy; without it, `'auto'` falls back to
 * `'none'` unless the caller opts in to `'dom-span'`.
 */
export function resolveStrategy(
  strategy: Strategy,
  fallback: 'dom-span' | 'none' = 'none'
): ResolvedStrategy {
  if (strategy !== 'auto') return strategy;
  return supportsCssHighlight() ? 'css-highlight' : fallback;
}

/** Construct the renderer for a resolved strategy. */
export function createRenderer(strategy: ResolvedStrategy, ctx: RendererContext): Renderer {
  switch (strategy) {
    case 'css-highlight':
      return new CssHighlightRenderer(ctx);
    case 'dom-span':
      return new DomSpanRenderer(ctx);
    case 'none':
      return new NoneRenderer(ctx);
  }
}
