# term-highlight

Highlight words, phrases, and regex patterns inside a DOM subtree — with a
matching engine that is fully decoupled from rendering, and two pluggable
rendering strategies: the modern **CSS Custom Highlight API** (no DOM mutation)
and a **`<mark>`-wrapping** fallback.

- **Zero runtime dependencies.** Dev-only tooling for build/test/lint.
- **TypeScript**, strict mode, ships **ESM + CJS + `.d.ts`**.
- **Matches across element boundaries** — a phrase split across inline tags
  (`hello <b>world</b>`) is one match.
- **Named groups** with independent styling, priority, and overlap resolution.
- **Find-style navigation**, group toggling, show-only-one, click detection,
  live re-matching, and complete teardown.

## Installation

```bash
npm install term-highlight
```

Node.js `>=18` for the tooling. At runtime the package targets any browser that
supports the DOM APIs it uses; see [Rendering strategies](#rendering-strategies).

## Quick start

```ts
import { createHighlighter } from 'term-highlight';

const highlighter = createHighlighter({
  root: document.getElementById('article')!,
  groups: [
    {
      name: 'keywords',
      terms: ['highlight', 'phrase', ['DOM', 'node']],
      style: { backgroundColor: '#fff3a0' },
    },
    {
      name: 'numbers',
      terms: [/\d+(\.\d+)?/],
      style: { backgroundColor: '#c8e6ff' },
      priority: 1,
    },
  ],
  // strategy: 'auto' (default) picks css-highlight when available.
  onHighlightClick: (match) => {
    console.log(`clicked "${match.text}" in group "${match.group}"`);
  },
});

// Find-style navigation:
document.getElementById('next')!.addEventListener('click', () => highlighter.next());
document.getElementById('prev')!.addEventListener('click', () => highlighter.previous());

// Show only one group:
highlighter.showOnly('numbers');

// After the article's content changes:
highlighter.update();

// When you're done:
highlighter.destroy();
```

## Rendering strategies

The matching engine produces DOM `Range`s; a **renderer** turns those into
something visible. Two are built in, sharing one interface, so the same API
(toggle, show-only, navigation, click, destroy) works with either.

### `css-highlight`

Uses the [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API):
it registers `Highlight` objects (sets of `Range`s) in `CSS.highlights` and
paints them with `::highlight()` rules in a single injected `<style>` element.

- **No DOM mutation.** The text tree is untouched, so it never breaks event
  listeners, React reconciliation, `contenteditable`, or layout. This is the
  recommended strategy where available.
- A single match may span multiple text nodes and elements — the underlying
  `Range` handles that natively.
- **Styling is limited** to the properties valid inside `::highlight()`
  (`color`, `background-color`, `text-decoration`, `text-shadow`,
  `-webkit-text-stroke`, etc.). Box-model properties (padding, border) do **not**
  apply.

**Browser support:** the CSS Custom Highlight API reached
[Baseline "newly available" in June 2025](https://developer.mozilla.org/en-US/docs/Web/API/Highlight)
— Chrome/Edge 105+, Safari 17.2+, and Firefox 140+.

### `dom-span`

Wraps each match in `<mark data-group="…">` elements, splitting text nodes as
needed. A match that crosses element boundaries is wrapped as **one fragment per
text-node segment**, all sharing the same `data-match-index` and group identity.
Overlapping matches (with `overlapStrategy: 'allow-overlap'`) are nested.

- Works **everywhere**, including older browsers.
- Full CSS styling is available (it's a real element), and clicks use native DOM
  events.
- It **does mutate the DOM**. `destroy()` (and every `update()`) unwraps the
  inserted elements and re-joins the split text nodes, restoring the original
  tree.

### `auto` (default)

Feature-detects `CSS.highlights` and the `Highlight` constructor. It uses
`css-highlight` when both are present, otherwise falls back to `dom-span`. You
can read the resolved value from `highlighter.activeStrategy`.

**When to force one:** pick `css-highlight` explicitly if you never support old
browsers and want to guarantee the DOM is never touched; pick `dom-span`
explicitly if you need box-model styling on highlights, must support browsers
without the Highlight API, or rely on real elements being present in the DOM
(e.g. for your own querying).

```ts
createHighlighter({ root, groups, strategy: 'css-highlight' });
createHighlighter({ root, groups, strategy: 'dom-span' });
```

## Click detection

`onHighlightClick(match)` fires when a rendered highlight is clicked.

- **`dom-span`** uses native element click events (event delegation on the root).
- **`css-highlight`** cannot use native events (there is no element). It performs
  manual point-in-rect hit-testing against each match's `Range.getClientRects()`
  on click. It intentionally does **not** use `highlightsFromPoint()`, which — as
  verified against MDN in 2026 — is still Chromium-only and absent in Firefox and
  Safari. Re-check that status before switching to the native API.

## Matching engine

- Text is collected with a `TreeWalker` (`SHOW_TEXT`), skipping `<script>`,
  `<style>`, and `<noscript>`.
- All text nodes are concatenated **directly** (no separators) into one string
  with an offset map back to `(text node, offset)`. This is what lets a term
  match across adjacent inline elements. (It also means a phrase can match across
  a block boundary if the rendered text happens to be adjacent, e.g.
  `<div>foo</div><div>bar</div>` contains `foobar`.)
- Literal `string` / `string[]` terms are **auto-escaped**; `RegExp` terms use
  their `source` as-is. All terms in a group are combined into **one** regex via
  alternation. For `RegExp` terms, per-term flags are ignored — case sensitivity
  is governed by the group's `caseSensitive` option so a group behaves
  consistently.
- Overlaps are resolved deterministically (see `overlapStrategy`).
- Matches are always returned in **document order**, which is what `next()` /
  `previous()` and `dom-span` insertion depend on.

### Known limitation: `wholeWord` and non-Latin scripts

`wholeWord: true` wraps the group pattern in `\b…\b`. JavaScript's `\b` is
**ASCII-only**: it treats only `[A-Za-z0-9_]` as word characters. For scripts
without ASCII word boundaries — CJK (Chinese/Japanese/Korean), Thai, etc. — `\b`
will misbehave (e.g. it can match at positions you don't consider word
boundaries, or fail to match at all). This is a deliberate, documented default
rather than a silent guess.

If you need script-aware boundaries, prefer explicit `RegExp` terms with Unicode
property escapes and lookarounds, e.g.:

```ts
// Instead of { terms: ['猫'], wholeWord: true }, express the boundary yourself:
{
  terms: [/(?<![\p{L}\p{N}])猫(?![\p{L}\p{N}])/u];
}
```

A future version may add an opt-in `Intl.Segmenter`-based boundary mode.

## API reference

### `createHighlighter(options): Highlighter`

Creates a highlighter and runs the first matching pass immediately.

### `HighlighterOptions`

| Option             | Type                                             | Default      | Description                                                   |
| ------------------ | ------------------------------------------------ | ------------ | ------------------------------------------------------------- |
| `root`             | `HTMLElement`                                    | — (required) | Root element whose subtree is scanned.                        |
| `groups`           | `HighlightGroup[]`                               | — (required) | Groups to highlight.                                          |
| `strategy`         | `'auto' \| 'css-highlight' \| 'dom-span'`        | `'auto'`     | Rendering strategy.                                           |
| `autoUpdate`       | `boolean`                                        | `false`      | Re-run matching automatically when the root subtree mutates.  |
| `overlapStrategy`  | `'first-match' \| 'priority' \| 'allow-overlap'` | `'priority'` | How to resolve overlapping matches.                           |
| `onHighlightClick` | `(match: MatchInfo) => void`                     | —            | Called when a rendered highlight is clicked.                  |
| `currentStyle`     | `Partial<CSSStyleDeclaration>`                   | orange bg    | Style for the "current" match set by `next()` / `previous()`. |

### `HighlightGroup`

| Field           | Type                           | Default   | Description                                                           |
| --------------- | ------------------------------ | --------- | --------------------------------------------------------------------- |
| `name`          | `string`                       | —         | Unique group name (used as registry key and `data-group`).            |
| `terms`         | `Term[]`                       | —         | `Term = string \| string[] \| RegExp`.                                |
| `wholeWord`     | `boolean`                      | `false`   | Require `\b` word boundaries (ASCII-only — see limitation above).     |
| `caseSensitive` | `boolean`                      | `false`   | Match case-sensitively.                                               |
| `className`     | `string`                       | —         | Extra class on wrapper elements (**`dom-span` only**).                |
| `style`         | `Partial<CSSStyleDeclaration>` | yellow bg | Highlight styling (as `::highlight()` rules or a generated CSS rule). |
| `priority`      | `number`                       | `0`       | Higher wins under `overlapStrategy: 'priority'` / paints on top.      |

### `overlapStrategy`

- **`priority`** (default): the match from the highest-`priority` group wins;
  ties fall back to earliest-then-longest.
- **`first-match`**: the earliest-starting match wins; ties broken by the longer
  match. Overlapping later matches are dropped.
- **`allow-overlap`**: every match is kept. With `css-highlight` they paint by
  `Highlight.priority`; with `dom-span` they are nested.

### `Highlighter`

| Member                   | Returns                         | Description                                                                        |
| ------------------------ | ------------------------------- | ---------------------------------------------------------------------------------- |
| `update()`               | `void`                          | Re-run the matching pass and re-render. Call after the root content changes.       |
| `destroy()`              | `void`                          | Full teardown: remove registry entries / wrappers / injected styles / listeners.   |
| `toggleGroup(name, on?)` | `void`                          | Toggle one group's visibility without re-matching (omit `on` to flip).             |
| `toggleAll(on?)`         | `void`                          | Toggle every group's visibility.                                                   |
| `showOnly(name)`         | `void`                          | Show exactly one group, hide the rest.                                             |
| `showAll()`              | `void`                          | Show all groups.                                                                   |
| `next()`                 | `MatchInfo \| undefined`        | Advance the "current" match (document order, wraps) and center it in the viewport. |
| `previous()`             | `MatchInfo \| undefined`        | Move the "current" match backwards.                                                |
| `getMatches(groupName?)` | `MatchInfo[]`                   | Resolved matches in document order, optionally filtered to one group.              |
| `activeStrategy`         | `'css-highlight' \| 'dom-span'` | The strategy actually in use after `auto` resolution.                              |

Navigation operates over **currently visible** matches, so hiding a group with
`toggleGroup` / `showOnly` also excludes it from `next()` / `previous()`.

### `MatchInfo`

```ts
interface MatchInfo {
  group: string; // group name
  text: string; // matched text
  start: number; // global start offset in the concatenated root text
  end: number; // global end offset (exclusive)
  index: number; // 0-based position in document order across all groups
  range: Range; // live DOM Range covering the match (may span nodes)
}
```

### `supportsCssHighlight(): boolean`

Feature-detects the CSS Custom Highlight API (the check `strategy: 'auto'` uses).

## Examples

### Multiple groups with independent styling

```ts
createHighlighter({
  root,
  groups: [
    { name: 'names', terms: ['Ada', 'Alan'], style: { backgroundColor: '#ffe0e0' } },
    { name: 'dates', terms: [/\b\d{4}\b/], style: { backgroundColor: '#e0ffe0' } },
  ],
});
```

### Whole-word, case-sensitive literal

```ts
createHighlighter({
  root,
  groups: [{ name: 'exact', terms: ['API'], wholeWord: true, caseSensitive: true }],
});
```

### Live content with automatic re-matching

```ts
const h = createHighlighter({ root, groups, autoUpdate: true });
// Mutations inside `root` are picked up automatically (batched on a microtask).
```

`autoUpdate` uses a `MutationObserver`; it disconnects itself while it re-renders
so its own changes don't cause a feedback loop.

## Building from source

```bash
npm install
npm run verify   # typecheck + lint + test + build + smoke (ESM & CJS)
```

## License

[MIT](./LICENSE) © Kev
