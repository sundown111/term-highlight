# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/kevinlukose/term-highlight/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kevinlukose/term-highlight/releases/tag/v0.1.0
