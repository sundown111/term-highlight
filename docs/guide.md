# Guide

Everything here is covered by a test (Vitest, or Playwright where a real browser
is needed) unless it says otherwise.

## Lifecycle

```ts
const h = createHighlighter({ root, groups, autoUpdate: true });
// ...
h.destroy();
```

`destroy()`:

- removes every `CSS.highlights` entry the instance registered, its `<style>`
  element, its `MutationObserver`, pending debounced updates and pointer
  listeners (or, for `dom-span`, restores the original text nodes);
- is **idempotent**;
- releases references to the root, groups, matches and your callbacks, so a
  framework ref that outlives the instance does not pin the DOM.

After `destroy()` the instance is inert. Mutating methods (`update`, `setTerms`,
`addGroup`, `updateGroup`, `clear`, `toggle*`, `show*`, `clearCurrent`) are silent
no-ops; `removeGroup`, `next`, `previous`, `goTo` and `getMatchAt` return `false` /
`undefined`; `getMatches()` and `getGroups()` return `[]`; `getStats().total` is
`0`. Nothing throws, and nothing is re-registered.

**Removed roots.** If the root is detached from the document, an `update()` (or
`autoUpdate` pass) clears the highlights and reports zero matches, so the global
registry never pins detached nodes (`css-highlight` strategy). Matching resumes at
the next `update()` once the root is attached again; `MutationObserver` cannot
tell you that, so call `update()` after re-attaching. `destroy()` always works.

**Multiple instances.** Each instance namespaces its registry keys and style
rule with an id from a counter stored on `globalThis`, so instances on different
roots, with identical group names, do not interfere, and neither do two copies of
the library on one page. Destroying one never touches another.

**Failures are atomic.** Invalid configuration throws a `TypeError` _before_
anything changes. A constructor that throws leaves no listeners, registry
entries or style tags behind. A group change that fails to compile keeps the
previous groups and highlights.

## Matching behaviour

- Literal terms are escaped and matched longest-first; `RegExp` terms contribute
  their `source` only (flags are ignored; use `caseSensitive`).
- Matching is case-insensitive by default. Case folding uses the regex engine's
  `i` flag **without** the `u` flag (so RegExp terms keep their usual syntax).
  This covers Latin, Cyrillic and Greek letters; case-insensitive matching of
  characters outside the Basic Multilingual Plane (for example Deseret) is not
  supported.
- Text nodes are concatenated without separators, so matches cross inline
  elements. Matches also cross block elements **unless** you set
  `blockBoundaries: true`. That option is tag-based (`p`, `div`, `li`,
  `h1`-`h6`, `td`, ...); it does not look at CSS `display`, and `<br>` is not a
  boundary.
- `script`, `style`, `noscript`, `textarea`, and anything matching `exclude` are
  skipped. Comments are not text. Elements hidden with CSS (`display: none`,
  `hidden`, `aria-hidden`) are **still scanned**; add them to `exclude`
  (`exclude: '[hidden], [aria-hidden="true"]'`) if you do not want them counted.

## Overlaps and priority

| `overlapStrategy`    | Rule                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `priority` (default) | Highest group `priority` wins; ties go to the earliest, then the longest match.                             |
| `first-match`        | Earliest start wins; ties go to the longer match.                                                           |
| `allow-overlap`      | Keep everything. `css-highlight` paints by `Highlight.priority` (the group's `priority`); `dom-span` nests. |

Losing matches are discarded, so they do not appear in `getMatches()`. Tested
against a brute-force reference on random inputs and, in Chromium, Firefox and
WebKit, by sampling real rendered pixels.

## Unicode

- Offsets are UTF-16 code units, exactly what DOM `Range` uses. Emoji and other
  surrogate pairs are never split (tested, including a pair split across two
  text nodes).
- `ignoreDiacritics` folds one code unit at a time, so lengths and offsets are
  preserved. Characters whose accent-free form is not a single code unit are left
  unchanged. A decomposed `e` + U+0301 matches `cafe` by its base letters; the
  range includes the combining mark only if the pattern does.
- `wholeWord: true` uses ASCII `\b`. `wholeWord: 'unicode'` rejects a match next
  to any letter, number, combining mark or `_` (full code points, so an emoji is
  not a word character). CJK and Thai have no spaces: use `RegExp` terms.
- Zero-width characters (U+200B...) inside the text are real characters: the
  literal `cat` does not match `ca​t`. Ranges stay valid either way.

## MutationObserver

See [frameworks.md](frameworks.md#mutationobserver-behaviour). In short: one
observer on `childList` + `subtree` + `characterData`, disconnected during
rendering (no feedback loop), bursts collapsed into one pass.

## SSR

Importing `term-highlight` in Node is safe (it touches no globals at import time
and is covered by the CJS/ESM smoke tests). `supportsCssHighlight()` returns
`false` there. `createHighlighter` needs a real element and throws a `TypeError`
without one, so call it from `useEffect` / `ngAfterViewInit` / `onMounted`, never
during server rendering.

## Browser support

The default `css-highlight` strategy needs `Highlight` and `CSS.highlights`
(Chrome/Edge 105+, Safari 17.2+, Firefox 140+ per MDN). Detection requires both a
`Highlight` constructor with `add()` and a registry with `set()`/`delete()`;
partial implementations count as unsupported. Without support, `strategy: 'auto'`
uses `fallback` (`'none'` by default: matching, navigation and callbacks work,
nothing is painted, the DOM is untouched). `fallback: 'dom-span'` wraps matches in
`<mark>` elements and restores the original DOM on `clear()` / `destroy()`
(tested). Forcing `strategy: 'css-highlight'` where it is missing throws
`CSS Custom Highlight API is not available in this environment.`

Tested here: Chromium 158, Firefox 159, WebKit 27.2 via Playwright 1.65 (see
`PRODUCTION_READINESS.md`). Older versions inside the documented range are
**not** tested.

## Performance characteristics

Every update re-walks the root, re-runs one regex per group and rebuilds all
`Range` objects; there is no incremental matching. Cost is roughly linear in text
length plus match count. Measured numbers, hardware and method are in
[`bench/RESULTS.md`](../bench/RESULTS.md); regenerate with `npm run bench`. Rough
shape on an Apple M1 Pro (Chromium 158, p50): about 4 ms for a 10,000-word
document, about 38 ms for 100,000 words (40k ranges), about 65 ms for a
one-million-character document (68k ranges). Firefox is 2-4x slower and WebKit 4-10x
slower on the largest documents, and many single calls there exceed 50 ms.

Practical guidance:

- For search-as-you-type on large documents, debounce (`connectSearchInput`
  defaults to 120 ms). Eight consecutive keystrokes on 100k words cost about 0.26 s
  in Chromium and 0.6-1 s in Firefox/WebKit if not debounced.
- `toggleGroup` / `showOnly` / navigation do not re-match.
- `exclude` large irrelevant subtrees; they are not walked.
- `maxMatches` caps ranges for pathological terms (a single common letter).
- Memory: 40k live ranges held about 3 MB of JS heap in Chromium; a 200-cycle
  create/destroy loop shows no heap growth (Playwright leak test).

## Limitations

- No incremental updates; no worker-based or time-limited regex execution.
- `css-highlight` styling is limited to properties valid in `::highlight()`.
- `blockBoundaries` is tag-based, not layout-based.
- CSS-hidden text is scanned unless excluded.
- Text inside shadow roots and iframes is not scanned.
- `<input>` / `<textarea>` values are never highlighted.
- The root's own `isConnected` is checked at update time only.

## Troubleshooting

| Symptom                                            | Likely cause                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Nothing is painted, but `getMatches()` has results | Browser without the Highlight API (`h.activeStrategy === 'none'`), or the style uses a property `::highlight()` ignores (padding, border). |
| Highlights vanish after the element is moved       | The root was detached during an update; call `update()` after re-attaching.                                                                |
| `TypeError: ... cannot be compiled`                | Two `RegExp` terms in one group conflict (e.g. the same named capture group). Split them into two groups.                                  |
| A phrase matches across two paragraphs             | Default behaviour; set `blockBoundaries: true`.                                                                                            |
| `foo` does not match `f​oo`                        | Zero-width characters are real characters; use a `RegExp` term.                                                                            |
| Page freezes on a user pattern                     | Catastrophic regex backtracking; see [security.md](security.md). Pass literals, not patterns.                                              |
| Highlights do not follow my framework's re-render  | Enable `autoUpdate`, or call `update()` after rendering.                                                                                   |

## Migration notes

- **Unreleased:** group definitions with unsupported term types (numbers, `null`),
  a non-finite `priority`, an invalid `wholeWord`, or patterns that cannot be
  compiled now throw `TypeError` instead of being silently ignored. All other
  changes are additive (`blockBoundaries`, `maxMatches`) or bug fixes.
- **1.0.0:** `fallback` defaults to `'none'`; pass `fallback: 'dom-span'` for the
  old behaviour. See the CHANGELOG.
