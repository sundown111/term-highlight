# term-highlight

Highlight words, phrases, and regex patterns in a web page **without adding a
single `<span>`, `<mark>`, `<div>`, or any other element.**

## The problem

Almost every highlighter works by wrapping each match in an element:

```html
<!-- before -->
<p>The quick brown fox</p>
<!-- after a typical highlighter -->
<p>The <mark>quick</mark> brown <mark>fox</mark></p>
```

term-highlight exists to **remove that step**. Wrapping text in `<span>`,
`<mark>`, or any other tag changes the page's structure, and that one change
causes a long list of bugs:

- **Frameworks crash or lose highlights.** React, Vue, and others find DOM they
  didn't create, then throw errors like `The node to be removed is not a child
of this node` or silently re-render the highlights away.
- **Editors break.** In `contenteditable` and rich-text editors the caret jumps,
  undo records the highlights as edits, and `<mark>` tags get saved into the
  user's content.
- **Listeners and references are lost.** Rewriting `innerHTML` re-creates every
  element, dropping event listeners and form input; splitting text nodes breaks
  any saved `Range` or `Selection`.
- **XSS risk.** Building highlighted HTML with string `replace()` can inject
  unescaped page text or search terms into `innerHTML`.
- **Layout and CSS change.** Selectors like `p > b` or `:first-child` stop
  matching, and global `mark`/`span` styles can shift text.
- **Matches across tags** (`hello <b>wor</b>ld`) need several fragments, and
  overlapping matches need nested tags.
- **Cleanup is fragile.** Every tag must be found, unwrapped, and its text
  re-joined, which goes wrong if anything else changed the DOM meanwhile.
- **Screen readers** may announce every `<mark>` as "highlight".
- **It's slow at scale.** Thousands of matches mean thousands of DOM writes,
  repeated on every keystroke.

Each problem is explained with examples in
**[Why highlight without `<span>` or `<mark>` tags](./docs/why-no-wrapper-tags.md)**.

## The solution

Modern browsers ship the **[CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API)**.
A page hands the browser a set of `Range`s (start and end points in the text)
and a name, then styles that name with `::highlight(name)`. The browser paints
the colour straight onto the text. **The DOM tree is never touched.**

```html
<!-- after term-highlight: identical to before -->
<p>The quick brown fox</p>
```

The API is low-level: you still have to find the matches, turn string offsets
into `Range`s across many text nodes, resolve overlaps, keep it all in sync
when content changes, and handle clicks without any element to click on.
**term-highlight does all of that for you.**

Want proof? Run `npm run demo`. The page counts DOM mutations inside the article
while you search, and the count stays at `0`.

| With `<span>` / `<mark>` wrappers       | With term-highlight                        |
| --------------------------------------- | ------------------------------------------ |
| Inserts elements and splits text nodes  | HTML before and after is identical         |
| Breaks React/Vue re-renders and editors | Framework and editor DOM is never touched  |
| Re-created elements lose listeners      | No elements are created or re-created      |
| `innerHTML` string building risks XSS   | No HTML strings are built or parsed        |
| Cleanup must unwrap and re-join text    | Cleanup just removes registry entries      |
| One DOM write per match                 | Zero DOM writes; the browser paints ranges |

> **Old browsers:** where the API is missing, term-highlight still never adds
> tags. By default it paints nothing there, while search, navigation, counts,
> and callbacks keep working. If you'd rather show `<mark>` tags on those
> browsers, opt in with `fallback: 'dom-span'`. See
> [Older browsers](./docs/why-no-wrapper-tags.md#older-browsers).

## Features

- **No DOM changes** with the CSS Custom Highlight API (Chrome/Edge 105+,
  Safari 17.2+, Firefox 140+), the main and default strategy. Older browsers
  get no wrapper tags either: by default nothing is painted there.
- **Search-box helper:** `connectSearchInput()` gives you highlight-as-you-type,
  Enter / Shift+Enter navigation, Escape to clear, and a live "3 of 12" count in a few lines.
- **Matches across element boundaries:** a phrase split across inline tags
  (`hello <b>world</b>`) is one match.
- **Accent-insensitive matching:** `cafe` finds `café`, `resume` finds `résumé`.
- **Unicode whole words:** `wholeWord: 'unicode'` works for accented Latin,
  Cyrillic, Greek, Arabic, and more.
- **Named groups** with their own style and priority. Add, remove, and change
  them at runtime.
- **Find-in-page navigation** (`next`, `previous`, `goTo`) that scrolls inside
  scroll containers, not just the window.
- **Hover and click callbacks** for tooltips, definitions, and glossaries, even
  though there is no element to listen on.
- **Skip regions** with `exclude: 'code, pre, nav'`.
- **Live content:** `autoUpdate` re-matches when the page changes, with optional
  debounce for streaming text.
- **Zero runtime dependencies**, TypeScript strict mode, ships ESM + CJS + `.d.ts`.

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

### Quick start: a search box in 10 lines

```ts
import { createHighlighter, connectSearchInput } from 'term-highlight';

const highlighter = createHighlighter({ root: document.querySelector('article')!, groups: [] });
const counter = document.querySelector('#count')!;

connectSearchInput(document.querySelector('input[type=search]')!, highlighter, {
  ignoreDiacritics: true,
  onChange: (stats) => {
    counter.textContent = stats.total ? `${stats.position} of ${stats.total}` : 'No results';
  },
});
```

Typing `red "big fox"` highlights `red` and the phrase `big fox`. Enter goes to
the next match, Shift+Enter to the previous one, and Escape clears the box.

## Rendering strategies

> **The CSS Custom Highlight API (`css-highlight`) is the main strategy.** It is
> what term-highlight is built around, it is used automatically wherever the
> browser supports it, and it never adds a tag to your page. The other
> strategies exist only for edge cases.

The matching engine produces DOM `Range`s; a **renderer** turns those into
something visible. All renderers share one interface, so the same API (toggle,
show-only, navigation, click, destroy) works with each.

| Strategy            | Role                | Changes the DOM?       | When it's used                                           |
| ------------------- | ------------------- | ---------------------- | -------------------------------------------------------- |
| **`css-highlight`** | **Main strategy**   | **No**                 | Automatically, in every browser that supports the API.   |
| `none`              | Default fallback    | No                     | Automatically, in browsers without the API.              |
| `dom-span`          | Legacy, opt-in only | Yes (inserts `<mark>`) | Only when you pass `strategy` or `fallback: 'dom-span'`. |

### `css-highlight` (main)

Uses the [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API):
it registers `Highlight` objects (sets of `Range`s) in `CSS.highlights` and
paints them with `::highlight()` rules in a single injected `<style>` element.
That `<style>` tag goes in `<head>`; nothing is added to the content you are
highlighting.

- **No DOM mutation.** The text tree is untouched, so it never breaks event
  listeners, React reconciliation, `contenteditable`, or layout.
- A single match may span multiple text nodes and elements — the underlying
  `Range` handles that natively.
- **Styling is limited** to the properties valid inside `::highlight()`
  (`color`, `background-color`, `text-decoration`, `text-shadow`,
  `-webkit-text-stroke`, etc.). Box-model properties (padding, border) do **not**
  apply.

**Browser support:** the CSS Custom Highlight API reached
[Baseline "newly available" in June 2025](https://developer.mozilla.org/en-US/docs/Web/API/Highlight)
— Chrome/Edge 105+, Safari 17.2+, and Firefox 140+.

### `none` (default fallback)

Runs matching, navigation, stats, and hover/click callbacks, but paints nothing
and never touches the document: no elements, no `<style>` tag, no registry
entries. It is what `auto` uses on browsers without the Highlight API, so the
"no wrapper tags" promise holds everywhere. You can also choose it directly to
drive your own UI, such as a results list or a minimap:

```ts
createHighlighter({ root, groups, strategy: 'none' });
```

### `dom-span` (legacy, opt-in)

Wraps each match in `<mark data-group="…">` elements, splitting text nodes as
needed. **This is the approach term-highlight was built to replace**, and it
brings back the problems described in
[Why highlight without `<span>` or `<mark>` tags](./docs/why-no-wrapper-tags.md).
It is never chosen automatically. Use it only if you must show highlights on
browsers without the Highlight API, or need box-model styling such as padding
or borders.

- Works in every browser.
- Full CSS styling, and clicks use native DOM events.
- It **mutates the DOM**. `destroy()` (and every `update()`) unwraps the
  inserted elements and re-joins the split text nodes.
- A match that crosses element boundaries is wrapped as one fragment per
  text-node segment, all sharing the same `data-match-index`. Overlapping
  matches (with `overlapStrategy: 'allow-overlap'`) are nested.

```ts
// Opt in: Highlight API where available, <mark> tags elsewhere.
createHighlighter({ root, groups, fallback: 'dom-span' });
// Opt in: always <mark> tags.
createHighlighter({ root, groups, strategy: 'dom-span' });
```

### `auto` (default)

Feature-detects `CSS.highlights` and the `Highlight` constructor. It uses
`css-highlight` when both are present, otherwise the `fallback` option
(`'none'` by default). Read the result from `highlighter.activeStrategy`.

## Click and hover detection

`onHighlightClick(match, event)` fires when a rendered highlight is clicked.
`onHighlightHover(match | undefined, event)` fires when the pointer moves onto a
highlight and again with `undefined` when it leaves. Hover is checked at most
once per animation frame. You can also hit-test any point yourself with
`highlighter.getMatchAt(clientX, clientY)`, e.g. from a `contextmenu` event.

- **`dom-span`** uses native element click events (event delegation on the root).
- **`css-highlight`** and **`none`** cannot use native events (there is no
  element). They narrow candidates with `caretPositionFromPoint` /
  `caretRangeFromPoint` + `Range.isPointInRange` (no layout work), then confirm
  with `Range.getClientRects()`. It intentionally does **not** use `highlightsFromPoint()`, which — as
  verified against MDN in 2026 — is still Chromium-only and absent in Firefox and
  Safari. Re-check that status before switching to the native API.

## Matching engine

- Text is collected with a `TreeWalker` (`SHOW_TEXT`), skipping `<script>`,
  `<style>`, `<noscript>`, `<textarea>`, and anything matching the `exclude`
  selector.
- All text nodes are concatenated **directly** (no separators) into one string
  with an offset map back to `(text node, offset)`. This is what lets a term
  match across adjacent inline elements. (It also means a phrase can match across
  a block boundary if the rendered text happens to be adjacent, e.g.
  `<div>foo</div><div>bar</div>` contains `foobar`.)
- Literal `string` / `string[]` terms are **auto-escaped**, de-duplicated, and
  tried **longest first**, so `['cat', 'category']` highlights all of
  "category" rather than just "cat". `RegExp` terms use their `source` as-is. All terms in a group are combined into **one** regex via
  alternation. For `RegExp` terms, per-term flags are ignored — case sensitivity
  is governed by the group's `caseSensitive` option so a group behaves
  consistently.
- With `ignoreDiacritics`, the text is accent-folded one UTF-16 code unit at a
  time (`é` → `e`, `ł` → `l`), so its length never changes and every offset
  still maps to the original DOM. Reported `match.text` is always the original.
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

**Use `wholeWord: 'unicode'`** for any script that separates words with spaces
or punctuation (accented Latin, Cyrillic, Greek, Arabic, Hebrew, Devanagari…).
It rejects a match when the character just before or after it is a Unicode
letter, number, combining mark, or `_`:

```ts
{ name: 'g', terms: ['café'], wholeWord: 'unicode' } // matches "café", not "cafés"
```

Scripts written without spaces between words (CJK, Thai) still need explicit
`RegExp` terms with Unicode property escapes and lookarounds, e.g.:

```ts
// Instead of { terms: ['猫'], wholeWord: true }, express the boundary yourself:
{
  terms: [/(?<![\p{L}\p{N}])猫(?![\p{L}\p{N}])/u];
}
```

## API reference

### `createHighlighter(options): Highlighter`

Creates a highlighter and runs the first matching pass immediately.

### `HighlighterOptions`

| Option             | Type                                                | Default      | Description                                                                   |
| ------------------ | --------------------------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| `root`             | `HTMLElement`                                       | — (required) | Root element whose subtree is scanned.                                        |
| `groups`           | `HighlightGroup[]`                                  | — (required) | Groups to highlight (may be empty; add more later).                           |
| `strategy`         | `'auto' \| 'css-highlight' \| 'none' \| 'dom-span'` | `'auto'`     | Rendering strategy. `auto` uses `css-highlight`, the main strategy.           |
| `fallback`         | `'none' \| 'dom-span'`                              | `'none'`     | What `auto` uses without the Highlight API. `'dom-span'` opts in to `<mark>`. |
| `exclude`          | `string` (CSS selector)                             | —            | Subtrees to skip, e.g. `'code, pre, [data-no-highlight]'`.                    |
| `autoUpdate`       | `boolean \| { debounce?: number }`                  | `false`      | Re-match when the root subtree mutates, optionally debounced (ms).            |
| `overlapStrategy`  | `'first-match' \| 'priority' \| 'allow-overlap'`    | `'priority'` | How to resolve overlapping matches.                                           |
| `scroll`           | `false \| 'smooth' \| 'auto' \| 'instant'`          | `'smooth'`   | How navigation scrolls the current match to the centre of its container.      |
| `currentStyle`     | `Partial<CSSStyleDeclaration>`                      | orange bg    | Style for the "current" match set by `next()` / `previous()` / `goTo()`.      |
| `onHighlightClick` | `(match, event) => void`                            | —            | A highlight was clicked.                                                      |
| `onHighlightHover` | `(match \| undefined, event) => void`               | —            | The pointer entered a highlight, or left all highlights (`undefined`).        |
| `onUpdate`         | `(matches, stats) => void`                          | —            | After every matching pass (initial, `update()`, auto-update, group change).   |
| `onCurrentChange`  | `(match \| undefined, stats) => void`               | —            | The current match changed. Use it to render "3 of 12".                        |

### `HighlightGroup`

| Field              | Type                           | Default   | Description                                                           |
| ------------------ | ------------------------------ | --------- | --------------------------------------------------------------------- |
| `name`             | `string`                       | —         | Unique group name (used as registry key and `data-group`).            |
| `terms`            | `Term[]`                       | —         | `Term = string \| string[] \| RegExp`.                                |
| `wholeWord`        | `boolean \| 'unicode'`         | `false`   | `true`: ASCII `\b` boundaries. `'unicode'`: script-aware boundaries.  |
| `ignoreDiacritics` | `boolean`                      | `false`   | Accent-insensitive: `cafe` matches `café` and vice versa.             |
| `caseSensitive`    | `boolean`                      | `false`   | Match case-sensitively.                                               |
| `className`        | `string`                       | —         | Extra class on wrapper elements (**`dom-span` only**).                |
| `style`            | `Partial<CSSStyleDeclaration>` | yellow bg | Highlight styling (as `::highlight()` rules or a generated CSS rule). |
| `priority`         | `number`                       | `0`       | Higher wins under `overlapStrategy: 'priority'` / paints on top.      |

### `overlapStrategy`

- **`priority`** (default): the match from the highest-`priority` group wins;
  ties fall back to earliest-then-longest.
- **`first-match`**: the earliest-starting match wins; ties broken by the longer
  match. Overlapping later matches are dropped.
- **`allow-overlap`**: every match is kept. With `css-highlight` they paint by
  `Highlight.priority`; with `dom-span` they are nested.

### `Highlighter`

| Member                     | Returns                                   | Description                                                                    |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `update()`                 | `void`                                    | Re-run matching and re-render. Keeps the current match if it still exists.     |
| `destroy()`                | `void`                                    | Full teardown: registry entries, wrappers, injected styles, listeners, timers. |
| `setTerms(name, terms)`    | `void`                                    | Replace a group's terms and re-match. Creates the group if missing.            |
| `addGroup(group)`          | `void`                                    | Add a group (replacing one with the same name) and re-match.                   |
| `updateGroup(name, patch)` | `void`                                    | Change a group's terms, style, priority, flags… and re-match.                  |
| `removeGroup(name)`        | `boolean`                                 | Remove a group. `false` if it didn't exist.                                    |
| `clear()`                  | `void`                                    | Remove all groups; the instance stays usable.                                  |
| `getGroups()`              | `HighlightGroup[]`                        | A copy of the current group configuration.                                     |
| `toggleGroup(name, on?)`   | `void`                                    | Show/hide one group without re-matching (omit `on` to flip).                   |
| `toggleAll(on?)`           | `void`                                    | Show/hide every group.                                                         |
| `showOnly(name)`           | `void`                                    | Show exactly one group, hide the rest.                                         |
| `showAll()`                | `void`                                    | Show all groups.                                                               |
| `isGroupVisible(name)`     | `boolean`                                 | Whether a group is currently shown.                                            |
| `next()`                   | `MatchInfo \| undefined`                  | Advance the current match (document order, wraps) and scroll it into view.     |
| `previous()`               | `MatchInfo \| undefined`                  | Move the current match backwards.                                              |
| `goTo(index)`              | `MatchInfo \| undefined`                  | Jump to the match with this `index` (e.g. from a results list).                |
| `clearCurrent()`           | `void`                                    | Remove the current-match indicator.                                            |
| `current`                  | `MatchInfo \| undefined`                  | The current match.                                                             |
| `getMatches(groupName?)`   | `MatchInfo[]`                             | Resolved matches in document order, optionally for one group.                  |
| `getStats()`               | `HighlightStats`                          | `{ total, visible, position, byGroup }` for counters and legends.              |
| `getMatchAt(x, y)`         | `MatchInfo \| undefined`                  | The visible match under a viewport point.                                      |
| `activeStrategy`           | `'css-highlight' \| 'dom-span' \| 'none'` | The strategy in use after `auto` resolution.                                   |

Navigation operates over **currently visible** matches, so hiding a group with
`toggleGroup` / `showOnly` also excludes it from `next()` / `previous()`. Hiding
the group that holds the current match clears the current match.

### `HighlightStats`

```ts
interface HighlightStats {
  total: number; // all matches, including hidden groups
  visible: number; // matches in visible groups (what next() steps through)
  position: number; // 1-based position of the current match among visible ones; 0 if none
  byGroup: Record<string, number>; // count per group (every group listed, even with 0)
}
```

### `connectSearchInput(input, highlighter, options?)`

Connects an `<input>` or `<textarea>` to one group (default `'search'`).
Accepts every `HighlightGroup` option (`style`, `wholeWord`, `ignoreDiacritics`,
`priority`…) plus:

| Option        | Type                       | Default    | Description                                                    |
| ------------- | -------------------------- | ---------- | -------------------------------------------------------------- |
| `group`       | `string`                   | `'search'` | Group the input controls. Created if missing (priority `10`).  |
| `mode`        | `'words' \| 'phrase'`      | `'words'`  | Split with `parseQuery`, or use the whole input as one phrase. |
| `debounce`    | `number` (ms)              | `120`      | Wait after typing stops.                                       |
| `jumpToFirst` | `boolean`                  | `true`     | Make the first match at or after your current place current.   |
| `keyboard`    | `boolean`                  | `true`     | Enter / Shift+Enter navigate, Escape clears (IME-safe).        |
| `allowRegex`  | `boolean`                  | `false`    | Let users type `/pattern/`.                                    |
| `minLength`   | `number`                   | `1`        | Ignore shorter words.                                          |
| `onChange`    | `(stats, current) => void` | —          | After each search and navigation; stats cover this group only. |

Returns `{ next(), previous(), refresh(), reset(), disconnect() }`.
Navigation steps through this group's matches only, so always-on groups such as
a glossary don't get in the way.

### `parseQuery(query, options?)`

Turns search-box text into terms: words split on whitespace, `"quoted"` or
`'quoted'` phrases kept together, duplicates removed, and (with
`allowRegex: true`) `/pattern/` tokens turned into `RegExp`s. An unterminated
quote runs to the end, so results stay stable while the user is typing.

```ts
parseQuery('red "big fox" red'); // ['red', 'big fox']
```

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

## Recipes

### Glossary with hover definitions

```ts
const definitions = {
  latency: 'Time from request to response.',
  throughput: 'Work done per second.',
};
const tooltip = document.querySelector('#tooltip')!;

createHighlighter({
  root: article,
  groups: [
    {
      name: 'glossary',
      terms: Object.keys(definitions),
      wholeWord: 'unicode',
      style: { textDecoration: 'underline dotted 2px' },
    },
  ],
  onHighlightHover: (match, event) => {
    tooltip.hidden = !match;
    if (!match) return;
    tooltip.textContent = definitions[match.text.toLowerCase() as keyof typeof definitions];
    tooltip.style.translate = `${event.clientX + 12}px ${event.clientY + 12}px`;
  },
});
```

### Results list that jumps to each match

```ts
const h = createHighlighter({ root, groups: [{ name: 'todo', terms: ['TODO', 'FIXME'] }] });
for (const m of h.getMatches()) {
  const item = document.createElement('button');
  item.textContent = m.text;
  item.onclick = () => h.goTo(m.index);
  list.append(item);
}
```

### Highlight search terms from the URL

```ts
// /docs/page?highlight=range+"custom highlight"
const q = new URLSearchParams(location.search).get('highlight');
if (q) createHighlighter({ root: main, groups: [{ name: 'q', terms: parseQuery(q) }] }).next();
```

### Content moderation or a spell-checker style underline

```ts
createHighlighter({
  root: editor, // works inside contenteditable: nothing is inserted
  autoUpdate: { debounce: 200 },
  groups: [
    {
      name: 'banned',
      terms: bannedWords,
      wholeWord: 'unicode',
      ignoreDiacritics: true,
      style: { textDecoration: 'wavy underline red' },
    },
  ],
});
```

### Streaming AI or chat output

```ts
// Re-match after the stream pauses instead of on every token.
createHighlighter({ root: chatLog, groups, autoUpdate: { debounce: 150 } });
```

### Skip code blocks and navigation

```ts
createHighlighter({ root: document.body, groups, exclude: 'pre, code, nav, [data-no-highlight]' });
```

### Legend with live counts and toggles

```ts
const h = createHighlighter({
  root,
  groups,
  onUpdate: (_m, stats) => {
    for (const [name, n] of Object.entries(stats.byGroup)) {
      legend.querySelector(`[data-group="${name}"] .count`)!.textContent = String(n);
    }
  },
});
legend.addEventListener('change', (e) => {
  const box = e.target as HTMLInputElement;
  h.toggleGroup(box.value, box.checked);
});
```

## Demo

```bash
npm install
npm run demo   # builds, then serves http://localhost:5173/examples/
```

Add `?q=your+search` to the URL to start with a search filled in.

## Building from source

```bash
npm install
npm run verify   # typecheck + lint + test + build + smoke (ESM & CJS)
```

## License

[MIT](./LICENSE) © Kev
