/**
 * Public type definitions for term-highlight.
 */

/**
 * A match target. Can be:
 * - a single literal string (auto-escaped),
 * - a list of literal strings (each auto-escaped, combined into one group pattern),
 * - a `RegExp` (used as-is; see {@link HighlightGroup.caseSensitive} for flag handling).
 */
export type Term = string | string[] | RegExp;

/**
 * How to resolve two or more matches that occupy overlapping character ranges.
 *
 * - `first-match`: the match that starts earliest wins; ties are broken by the
 *   longer match. Overlapping later matches are discarded.
 * - `priority`: the match belonging to the group with the highest `priority`
 *   wins; ties fall back to `first-match` ordering.
 * - `allow-overlap`: no resolution is performed; every match is kept. With the
 *   `css-highlight` strategy overlapping ranges paint according to each
 *   highlight's `priority`; with `dom-span` overlapping matches are nested.
 */
export type OverlapStrategy = 'first-match' | 'priority' | 'allow-overlap';

/** Rendering strategy. See the README "Rendering strategies" section. */
export type Strategy = 'auto' | 'css-highlight' | 'dom-span';

/** A single configured group of terms with independent styling. */
export interface HighlightGroup {
  /** Unique group name. Used as the highlight registry key and `data-group` value. */
  name: string;
  /** One or more terms to match for this group. */
  terms: Term[];
  /** Require matches to fall on word boundaries (`\b`). ASCII-only; see README. */
  wholeWord?: boolean;
  /** Match case-sensitively. Defaults to `false` (case-insensitive). */
  caseSensitive?: boolean;
  /** Extra class name applied to wrapper elements (dom-span strategy only). */
  className?: string;
  /**
   * Styles used to paint the highlight. Applied as `::highlight()` rules for the
   * css-highlight strategy, or as a generated CSS rule for the dom-span strategy.
   * Only a subset of CSS properties is valid inside `::highlight()` (color,
   * background-color, text-decoration, etc.) — see README.
   */
  style?: Partial<CSSStyleDeclaration>;
  /** Higher numbers paint on top of / win over lower numbers. Defaults to `0`. */
  priority?: number;
}

/** Options passed to {@link createHighlighter}. */
export interface HighlighterOptions {
  /** The root element whose subtree is scanned for matches. */
  root: HTMLElement;
  /** The groups to highlight. */
  groups: HighlightGroup[];
  /** Rendering strategy. Defaults to `'auto'`. */
  strategy?: Strategy;
  /** Re-run matching automatically when the root subtree mutates. Defaults to `false`. */
  autoUpdate?: boolean;
  /** How to resolve overlapping matches. Defaults to `'priority'`. */
  overlapStrategy?: OverlapStrategy;
  /** Called when a rendered highlight is clicked. */
  onHighlightClick?: (match: MatchInfo) => void;
  /**
   * Styles for the "current" match set by {@link Highlighter.next} /
   * {@link Highlighter.previous}. Defaults to an orange background.
   */
  currentStyle?: Partial<CSSStyleDeclaration>;
}

/** Information about a single resolved match. */
export interface MatchInfo {
  /** Name of the group this match belongs to. */
  group: string;
  /** The matched text. */
  text: string;
  /** Global start offset within the concatenated text of the root subtree. */
  start: number;
  /** Global end offset (exclusive). */
  end: number;
  /** Index of this match in document order across all groups (0-based). */
  index: number;
  /**
   * A live DOM `Range` covering the match. May span multiple text nodes and
   * elements. Do not mutate; it is owned by the highlighter.
   */
  range: Range;
}

/** The highlighter instance returned by {@link createHighlighter}. */
export interface Highlighter {
  /** Re-run the matching pass and re-render. Call after the root content changes. */
  update(): void;
  /** Tear down completely: remove all highlights, styles, and listeners. */
  destroy(): void;
  /**
   * Toggle a single group's visibility without re-matching.
   * @param name group name
   * @param on force on (`true`) / off (`false`); omit to flip current state
   */
  toggleGroup(name: string, on?: boolean): void;
  /** Toggle every group's visibility without re-matching. */
  toggleAll(on?: boolean): void;
  /** Show exactly one group's highlights and hide all others. */
  showOnly(name: string): void;
  /** Show all groups. */
  showAll(): void;
  /** Move the "current match" indicator to the next match (document order) and scroll it into view. */
  next(): MatchInfo | undefined;
  /** Move the "current match" indicator to the previous match and scroll it into view. */
  previous(): MatchInfo | undefined;
  /** Get resolved matches, optionally filtered to a single group, in document order. */
  getMatches(groupName?: string): MatchInfo[];
  /** The strategy actually in use (after `auto` resolution). */
  readonly activeStrategy: Exclude<Strategy, 'auto'>;
}
