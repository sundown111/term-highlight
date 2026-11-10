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

/**
 * Rendering strategy. See the README "Rendering strategies" section.
 *
 * - `css-highlight`: **the main strategy.** Paints with the CSS Custom
 *   Highlight API; no element is inserted and the DOM is never modified.
 * - `none`: match and navigate, but paint nothing and never touch the DOM.
 * - `dom-span`: legacy opt-in that wraps matches in `<mark>` elements. Only
 *   used when you ask for it explicitly.
 * - `auto` (default): `css-highlight` when available, otherwise
 *   {@link HighlighterOptions.fallback} (`'none'` by default).
 */
export type Strategy = 'auto' | 'css-highlight' | 'dom-span' | 'none';

/** The concrete strategy in use after `auto` resolution. */
export type ResolvedStrategy = Exclude<Strategy, 'auto'>;

/**
 * Word-boundary mode.
 * - `true`: ASCII `\b` boundaries (fast, Latin-only).
 * - `'unicode'`: a match must not be preceded or followed by a Unicode letter,
 *   number, combining mark, or `_`. Works for accented Latin, Cyrillic, Greek,
 *   Arabic, etc. Scripts written without spaces (CJK, Thai) still need explicit
 *   `RegExp` terms.
 */
export type WholeWord = boolean | 'unicode';

/** A single configured group of terms with independent styling. */
export interface HighlightGroup {
  /** Unique group name. Used as the highlight registry key and `data-group` value. */
  name: string;
  /** One or more terms to match for this group. */
  terms: Term[];
  /** Require matches to fall on word boundaries. See {@link WholeWord}. */
  wholeWord?: WholeWord;
  /**
   * Match regardless of accents: `cafe` finds `café`, `resume` finds `résumé`.
   * Applies to literal string terms; `RegExp` terms run against the
   * accent-stripped text, so write them without accents. Defaults to `false`.
   */
  ignoreDiacritics?: boolean;
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
  /**
   * Used by `strategy: 'auto'` when the CSS Custom Highlight API is missing.
   * `'none'` (default) keeps the DOM untouched and paints nothing on those
   * browsers; matching, navigation, stats, and callbacks still work.
   * `'dom-span'` opts in to wrapping matches in `<mark>` elements instead.
   */
  fallback?: 'dom-span' | 'none';
  /**
   * Re-run matching automatically when the root subtree mutates. Pass
   * `{ debounce: ms }` to wait for mutations to settle (useful for streaming or
   * typing-heavy content). Defaults to `false`.
   */
  autoUpdate?: boolean | { debounce?: number };
  /**
   * CSS selector for subtrees to skip, e.g. `'code, pre, [data-no-highlight]'`.
   * `<script>`, `<style>`, `<noscript>`, and `<textarea>` are always skipped.
   */
  exclude?: string;
  /**
   * How `next()` / `previous()` / `goTo()` scroll the current match into view.
   * Scrolls the nearest scrollable ancestor of the root, or the window.
   * `false` disables scrolling. Defaults to `'smooth'`.
   */
  scroll?: false | 'smooth' | 'auto' | 'instant';
  /**
   * Stop a match from spanning two block-level elements. By default text nodes
   * are concatenated directly, so `<p>foo</p><p>bar</p>` matches `foobar`.
   * With `true`, a virtual line break separates blocks (tag-based: `p`, `div`,
   * `li`, `h1`-`h6`, `td`, ... ; CSS `display` is not consulted). Defaults to `false`.
   */
  blockBoundaries?: boolean;
  /**
   * Safety valve: stop after this many matches in total (earlier groups first).
   * Defaults to unlimited. Does not bound regex execution time.
   */
  maxMatches?: number;
  /** How to resolve overlapping matches. Defaults to `'priority'`. */
  overlapStrategy?: OverlapStrategy;
  /** Called when a rendered highlight is clicked. */
  onHighlightClick?: (match: MatchInfo, event: MouseEvent) => void;
  /**
   * Called when the pointer enters a highlight (with the match) and when it
   * leaves all highlights (with `undefined`). Handy for tooltips/definitions.
   */
  onHighlightHover?: (match: MatchInfo | undefined, event: MouseEvent) => void;
  /** Called after every matching pass (initial, `update()`, auto-update, group changes). */
  onUpdate?: (matches: MatchInfo[], stats: HighlightStats) => void;
  /** Called whenever the "current" match changes, e.g. to render "3 of 12". */
  onCurrentChange?: (match: MatchInfo | undefined, stats: HighlightStats) => void;
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

/** Counts for building a "3 of 12" style indicator or a per-group legend. */
export interface HighlightStats {
  /** Total resolved matches, including hidden groups. */
  total: number;
  /** Matches in currently visible groups (what `next()` iterates over). */
  visible: number;
  /** 1-based position of the current match among visible matches, or `0` if none. */
  position: number;
  /** Match count per group name (every configured group appears, even with 0). */
  byGroup: Record<string, number>;
}

/** Fields of a group that can be changed after creation with `updateGroup`. */
export type HighlightGroupPatch = Partial<Omit<HighlightGroup, 'name'>>;

/** The highlighter instance returned by {@link createHighlighter}. */
export interface Highlighter {
  /** Re-run the matching pass and re-render. Call after the root content changes. */
  update(): void;
  /**
   * Tear down completely: remove all highlights, styles, observers and
   * listeners and release references to the root and callbacks. Idempotent.
   * Afterwards every mutating method is a silent no-op and queries return empty
   * results (`getMatches()` is `[]`, `next()` is `undefined`, `removeGroup()` is `false`).
   */
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
  /** Jump to the match with this document-order `index` (see {@link MatchInfo.index}). */
  goTo(index: number): MatchInfo | undefined;
  /** Clear the "current match" indicator without changing anything else. */
  clearCurrent(): void;
  /** The current match, if any. */
  readonly current: MatchInfo | undefined;
  /** Get resolved matches, optionally filtered to a single group, in document order. */
  getMatches(groupName?: string): MatchInfo[];
  /** Match counts and the current position. */
  getStats(): HighlightStats;
  /** The visible match under a viewport point (e.g. from a `contextmenu` event). */
  getMatchAt(clientX: number, clientY: number): MatchInfo | undefined;
  /** Whether a group is currently visible. */
  isGroupVisible(name: string): boolean;
  /** A copy of the current group configuration. */
  getGroups(): HighlightGroup[];
  /** Replace a group's terms and re-match. Creates the group if it does not exist. */
  setTerms(name: string, terms: Term[]): void;
  /** Add a group (or replace one with the same name) and re-match. */
  addGroup(group: HighlightGroup): void;
  /** Remove a group and re-match. Returns `false` if no such group existed. */
  removeGroup(name: string): boolean;
  /** Change a group's options (terms, style, priority, …) and re-match. */
  updateGroup(name: string, patch: HighlightGroupPatch): void;
  /** Remove all groups and their highlights; the instance stays usable for `addGroup` / `setTerms`. */
  clear(): void;
  /** The strategy actually in use (after `auto` resolution). */
  readonly activeStrategy: ResolvedStrategy;
}
