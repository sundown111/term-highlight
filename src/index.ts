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
  ResolvedStrategy,
  WholeWord,
  HighlightStats,
  HighlightGroupPatch,
  OverlapStrategy,
  HighlightGroup,
  HighlighterOptions,
  MatchInfo,
  Highlighter,
} from './types.js';
export { supportsCssHighlight } from './css-highlight-api.js';

// Helpers for search-box style UIs.
export { parseQuery } from './query.js';
export type { ParseQueryOptions } from './query.js';
export { connectSearchInput } from './search-input.js';
export type { SearchInputOptions, SearchInputConnection } from './search-input.js';

// Lower-level building blocks, exported for advanced use / testing.
export { escapeRegExp, buildGroupRegExp, computeMatches, foldDiacritics } from './matcher.js';
export type { TextModel, MatchOptions } from './matcher.js';
