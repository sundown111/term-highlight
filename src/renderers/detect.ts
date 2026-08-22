import type { Strategy } from '../types.js';
import type { Renderer, RendererContext } from './renderer.js';
import { CssHighlightRenderer } from './css-highlight.js';
import { DomSpanRenderer } from './dom-span.js';
import { supportsCssHighlight } from '../css-highlight-api.js';

/** Resolve `'auto'` to a concrete strategy via feature detection. */
export function resolveStrategy(strategy: Strategy): Exclude<Strategy, 'auto'> {
  if (strategy === 'css-highlight' || strategy === 'dom-span') return strategy;
  return supportsCssHighlight() ? 'css-highlight' : 'dom-span';
}

/** Construct the renderer for a resolved strategy. */
export function createRenderer(
  strategy: Exclude<Strategy, 'auto'>,
  ctx: RendererContext
): Renderer {
  return strategy === 'css-highlight' ? new CssHighlightRenderer(ctx) : new DomSpanRenderer(ctx);
}
