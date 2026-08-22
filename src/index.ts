/**
 * term-highlight — highlight words, phrases, and regex patterns inside a DOM
 * subtree using the CSS Custom Highlight API or DOM-span wrapping.
 *
 * @packageDocumentation
 */

export { createHighlighter } from './highlighter.js';
export type {
  Term,
  Strategy,
  OverlapStrategy,
  HighlightGroup,
  HighlighterOptions,
  MatchInfo,
  Highlighter,
} from './types.js';
export { supportsCssHighlight } from './css-highlight-api.js';

// Lower-level building blocks, exported for advanced use / testing.
export { escapeRegExp, buildGroupRegExp, computeMatches } from './matcher.js';
export type { TextModel } from './matcher.js';
