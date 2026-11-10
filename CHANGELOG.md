# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Overlap resolution is now O(n log n).** It was O(n²): 100,000 matches took
  about 8 s (jsdom); 200,000 now take under a second.
- **No stack overflow on very large result sets.** Matches from a group were
  spread into `push(...)`, which threw `RangeError: Maximum call stack size
  exceeded` at roughly 150,000 matches.
- **Group changes are atomic.** If `addGroup` / `updateGroup` / `setTerms` is
  given something that cannot compile (for example two `RegExp` terms with the
  same named capture group), a `TypeError` is thrown and the previous groups,
  matches and registry entries are kept. Previously the state was left half
  replaced.
- **A failed `update()` no longer disconnects `autoUpdate`.**
- **A constructor that throws no longer leaks** listeners, registry entries or a
  `<style>` tag.
- **Instance ids are unique across duplicate copies of the library** (for example
  an ESM and a CommonJS build on one page). They shared a module-local counter
  and could overwrite each other's `CSS.highlights` entries.
- **Unsafe style values are dropped** instead of being written into the generated
  `<style>` rule (`color: 'red; } body { display: none'` could previously break out
  of the `::highlight()` rule).
- **Partial Highlight API support** (a `Highlight` constructor without a usable
  registry, or a non-Map-like registry) is detected as unsupported instead of
  failing later.
- A root removed from the document no longer keeps its nodes pinned in the
  global highlight registry: highlights are cleared, and return on the next
  `update()` once the root is attached again (`css-highlight` only).

### Added

- `blockBoundaries: true` option: matches can no longer span block-level
  elements. Default `false`, so existing behaviour is unchanged.
- `maxMatches` option: stop after N matches.
- Defined behaviour after `destroy()`: mutating methods are silent no-ops and
  queries return empty results; the instance releases its root, groups and
  callbacks.
- Stricter validation with clear `TypeError`s: non-string/array/RegExp terms,
  non-finite `priority`, invalid `wholeWord`, and patterns that cannot be
  compiled.
- Source maps (`dist/*.map`), `README`/`LICENSE`/`CHANGELOG` in the package, npm
  provenance configuration.
- Test infrastructure: 184 Vitest tests with enforced coverage thresholds,
  Playwright suites for Chromium, Firefox and WebKit (rendering, priorities,
  click/hover, navigation, dynamic updates, cleanup, unsupported-API mocks, heap
  leak and performance guards), reproducible benchmarks (`npm run bench`),
  packed-tarball validation (`npm run pack:check`).
- `docs/guide.md`, `docs/frameworks.md`, `docs/security.md`, `SECURITY.md`,
  `PRODUCTION_READINESS.md`, framework examples.

### Changed

- Invalid group definitions that were previously ignored silently (for example a
  numeric term) now throw a `TypeError`. This is the only behavioural change that
  could affect existing callers.
- CI runs coverage thresholds, browser tests, the packed-tarball check and a
  production dependency audit.

## [1.1.0]

### Changed

- The demo page became an interactive playground (no library API changes).

## [1.0.0] - 2026-11-10

First stable release. The public API from 0.2.0 is now covered by semantic
versioning: breaking changes will only ship in a new major version.

### Added

- `docs/why-no-wrapper-tags.md`: why term-highlight avoids `<span>` / `<mark>`
  wrapper tags, the problems they cause, how the CSS Custom Highlight API
  avoids each one, trade-offs, fallback choice, and a migration guide. The
  README links to it and summarises the problems.

### Changed

- **`fallback` now defaults to `'none'`** (was `'dom-span'`). With the default
  `strategy: 'auto'`, browsers without the CSS Custom Highlight API no longer
  get `<mark>` tags inserted; nothing is painted there, while matching,
  navigation, stats, and callbacks keep working. Pass `fallback: 'dom-span'` to
  restore the old behaviour.
- The CSS Custom Highlight API (`css-highlight`) is documented as the main
  strategy; `dom-span` is documented as legacy and opt-in only.
- More npm keywords for discoverability (word, keyword, text, and search
  highlighting).

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
