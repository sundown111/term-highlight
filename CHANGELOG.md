# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-10

First stable release. The public API from 0.2.0 is now covered by semantic
versioning: breaking changes will only ship in a new major version.

### Added

- `docs/why-no-wrapper-tags.md`: why term-highlight avoids `<span>` / `<mark>`
  wrapper tags, the problems they cause, how the CSS Custom Highlight API
  avoids each one, trade-offs, fallback choice, and a migration guide. The
  README links to it and summarises the problems.

### Fixed

- `CONTRIBUTING.md` clone URL points at `sundown111/term-highlight`.

## [0.2.0] - 2026-11-03

### Added

- `connectSearchInput(input, highlighter, options)`: highlight-as-you-type
  search box with Enter / Shift+Enter navigation, Escape to clear, debounce,
  IME-safe key handling, and an `onChange(stats, current)` callback for
  "3 of 12" counters. Returns `next`, `previous`, `refresh`, `reset`, and
  `disconnect`.
- `parseQuery(query, options)`: turns search-box text into terms (words, quoted
  phrases, optional `/regex/`).
- `strategy: 'none'` and `fallback: 'dom-span' | 'none'`. With
  `fallback: 'none'` the DOM is never modified, even without the CSS Custom
  Highlight API.
- Runtime group management: `setTerms`, `addGroup`, `updateGroup`,
  `removeGroup`, `clear`, `getGroups`.
- Navigation and state: `goTo(index)`, `clearCurrent()`, `current`,
  `getStats()`, `isGroupVisible(name)`, `getMatchAt(x, y)`.
- Callbacks: `onHighlightHover`, `onUpdate`, `onCurrentChange`.
  `onHighlightClick` now also receives the `MouseEvent`.
- Group options `ignoreDiacritics` (accent-insensitive matching) and
  `wholeWord: 'unicode'` (script-aware word boundaries).
- Options `exclude` (CSS selector of subtrees to skip), `scroll` (behaviour or
  `false`), and `autoUpdate: { debounce }`.
- `foldDiacritics` export and a `MatchOptions` argument to `computeMatches`.
- Demo page (`npm run demo`) that counts DOM mutations to show it stays at 0.

### Changed

- Literal terms are de-duplicated and tried longest-first, so `['cat',
  'category']` highlights all of "category".
- `update()` keeps the current match when it still exists, instead of resetting.
- Navigation scrolls the nearest scrollable container, not only the window.
- Hiding the group that holds the current match clears the current match.
- `<textarea>` content is no longer scanned.
- The highlighter copies `groups`; it no longer reads later changes to the
  array you passed in. Use the group-management methods instead.
- Hover/click hit-testing for `css-highlight` narrows candidates with the
  caret-from-point APIs before measuring rects.

### Fixed

- Group names that are not valid CSS identifiers (spaces, punctuation) now
  produce valid `::highlight()` rules.
- `dom-span` no longer reports clicks on highlights of hidden groups.

## [0.1.0] - 2026-08-15

### Added

- Initial release.
- `createHighlighter(options)` factory returning a `Highlighter`.
- Matching engine that walks a root subtree with a `TreeWalker`, skips
  `<script>`, `<style>`, and `<noscript>`, and builds a flat concatenated string
  with an offset map so matches can span multiple text nodes and elements.
- Term types: literal `string`, `string[]`, and `RegExp` (literals auto-escaped).
- Named groups with independent styling and priority.
- `wholeWord` and `caseSensitive` per-group options.
- Two rendering strategies behind one interface:
  - `css-highlight` using the CSS Custom Highlight API (no DOM mutation).
  - `dom-span` wrapping matches in `<mark>` elements (splits text nodes,
    wraps one fragment per segment for cross-element matches, nests overlaps).
  - `auto` (default) feature-detects `CSS.highlights`.
- Overlap resolution strategies: `first-match`, `priority`, `allow-overlap`.
- `toggleGroup`, `toggleAll`, `showOnly`, `showAll` visibility controls that do
  not re-run matching.
- `next()` / `previous()` find-style navigation with a distinct "current" style
  and viewport-centered scrolling computed from the match's own bounding rect.
- Click detection: `onHighlightClick` callback, implemented via
  `Range.getClientRects()` point-in-rect hit-testing for `css-highlight` and
  native element events for `dom-span`.
- `update()` to re-run matching and optional `autoUpdate` `MutationObserver`.
- `destroy()` for full cleanup of registry entries, wrapper elements, injected
  styles, and listeners.

[Unreleased]: https://github.com/sundown111/term-highlight/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sundown111/term-highlight/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/sundown111/term-highlight/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sundown111/term-highlight/releases/tag/v0.1.0
