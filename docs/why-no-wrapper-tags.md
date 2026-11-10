# Why highlight without `<span>` or `<mark>` tags

term-highlight exists to **remove the need for wrapper tags** when you highlight
text. This page explains what goes wrong when a highlighter inserts `<span>`,
`<mark>`, `<em>`, `<div>`, or any other element around matched text, and how
term-highlight avoids each problem.

## How wrapper-tag highlighting works

Most highlight libraries, and most hand-written "highlight the search term"
code, do some version of this:

```js
// Approach 1: rewrite the HTML as a string
el.innerHTML = el.innerHTML.replace(/fox/gi, (m) => `<mark>${m}</mark>`);

// Approach 2: split text nodes and wrap the pieces
const mark = document.createElement('mark');
textNode.splitText(start);
// ...move the matched piece into `mark`, insert `mark` where the text was
```

Either way, the page's HTML is permanently different afterwards:

```html
<!-- before -->
<p>The quick brown fox</p>

<!-- after -->
<p>The quick brown <mark>fox</mark></p>
```

The text looks the same, apart from the colour. Underneath, the document now
has extra elements and split text nodes, and code that relied on the old
structure can break.

## The problems

### 1. Frameworks lose track of their own DOM

React, Vue, Svelte, Angular, and similar frameworks keep their own record of the
DOM they rendered. They update text by writing to the exact text nodes they
created, and they remove elements by asking the parent they expect.

When a highlighter splits a text node or moves it into a `<mark>`, that record is
wrong. The next re-render then either:

- updates a text node that is no longer on the page, so stale text stays visible,
- throws errors such as
  `Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node`,
  or
- quietly re-renders over the highlights and they vanish.

Browser translation extensions cause the same well-known crashes in React apps
for the same reason: they rewrite text nodes the framework owns.

### 2. Editors, selections, and the caret break

In a `contenteditable` area or a rich-text editor (ProseMirror, Slate, Lexical,
Quill, TipTap…), the DOM _is_ the document. Inserting `<mark>` tags:

- moves the caret or collapses the user's selection while they are typing,
- makes undo/redo record highlight changes as if the user had edited the text,
- and can save the highlights into the user's content, so `<mark>` ends up in
  the database, in emails, or in exported documents.

### 3. Event listeners and references break

- `innerHTML` rewriting (approach 1) re-creates every element inside the
  container. All event listeners attached to those elements are gone, form
  inputs lose what was typed, and any saved reference to an inner element
  points at a detached copy.
- Splitting text nodes (approach 2) breaks any code, `Range`, or `Selection`
  that pointed into the original text node.
- Every insertion fires `MutationObserver`s, which can trigger other scripts,
  analytics, or your own auto-save logic.

### 4. Security risk with `innerHTML`

Building highlighted HTML with string replacement is an easy way to introduce
cross-site scripting (XSS). If the search term or the page text contains
`<img src=x onerror=…>`, a careless `replace()` puts it straight back into
`innerHTML`, and the browser runs it.

### 5. Layout and CSS change

- Selectors that depend on structure stop matching: `p > b`, `:first-child`,
  `:empty`, `+` and `~` sibling selectors, and `nth-child` counts all see the new
  elements.
- Global styles for `mark` or `span` (padding, borders, `display`) can shift
  text, change line breaks, or break `text-overflow: ellipsis`.
- Text-measuring code such as "fit text to box" or virtualised lists can give
  different results with the extra elements present.

### 6. Matches that cross tags can't be wrapped cleanly

A phrase can span existing tags, as in `hello <b>wor</b>ld`. One `<mark>` can't
legally wrap part of `<b>` and part of the text after it, so the highlighter has
to produce several fragments. Overlapping matches from different groups need
nested tags. Each fragment adds more of the problems above.

### 7. Cleanup is fragile

To remove highlights, the library must find every tag it inserted, unwrap it,
and re-join the text nodes it split (`normalize()`). If anything else changed
the DOM in between, such as a framework re-render, an editor transaction, or a
second highlighter, the cleanup can leave stray tags behind or merge text nodes
it never split.

### 8. Accessibility side effects

Screen readers may announce `<mark>` as "highlight" around every match, which is
noisy on a page with dozens of results. Splitting a word across several elements
can also make some screen readers pause or mispronounce it.

### 9. Performance

Each wrapper is a DOM write. Highlighting thousands of matches means thousands
of element insertions, each one able to trigger style recalculation and layout.
Re-highlighting while the user types multiplies that cost on every keystroke.

## How term-highlight avoids all of this

term-highlight uses the browser's
[CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API):

1. It reads the page text (without changing it) and finds every match.
2. For each match it creates a `Range`, which is just a pair of positions
   pointing into the existing text nodes.
3. It registers those ranges with `CSS.highlights` under a name.
4. A `::highlight(name)` CSS rule tells the browser what colour to paint them.

The browser paints the colour on top of the text, the way it paints a text
selection. **No element is inserted, no text node is split, and the HTML before
and after highlighting is identical.**

| Problem with wrapper tags           | With term-highlight                                                      |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Framework re-render crashes         | The framework's DOM is never touched.                                    |
| Editor caret, undo, saved `<mark>`s | Editor content is never changed, so nothing is saved or undone.          |
| Lost listeners and stale references | No elements are re-created and no text nodes are split.                  |
| XSS through `innerHTML`             | No HTML strings are ever built or parsed.                                |
| CSS selectors and layout shifts     | The element tree stays the same, so selectors and layout don't change.   |
| Matches across tags                 | One `Range` can span any number of tags, so a match stays one match.     |
| Fragile cleanup                     | Cleanup deletes registry entries; there is nothing in the DOM to unwrap. |
| Screen reader noise                 | No `<mark>` elements are announced.                                      |
| Thousands of DOM writes             | No DOM writes; the browser paints ranges as one batch.                   |

You can watch this happen: run `npm run demo` and search. The page counts
changes to the article's HTML while you search, and the count stays at `0`.

### Clicks and hovers without an element

With no element there is nothing to attach a click listener to.
term-highlight works out which match is under the pointer from the text
position and the match's on-screen rectangles, then calls your
`onHighlightClick` or `onHighlightHover` callback with that match.

## Trade-offs

Being honest about what this approach can't do:

- **Limited styling.** Only some CSS properties work inside `::highlight()`:
  `color`, `background-color`, `text-decoration`, `text-shadow`, and
  `-webkit-text-stroke`, among others. Padding, borders, border-radius, and
  `display` don't apply, because there is no box to style.
- **Browser support.** The API is available in Chrome and Edge 105+, Safari
  17.2+, and Firefox 140+. Older browsers don't have it.

## Older browsers

The CSS Custom Highlight API is term-highlight's main strategy, and the default
`strategy: 'auto'` uses it wherever the browser supports it. When the API is
missing, `auto` uses the `fallback` option:

- `fallback: 'none'` (**the default**) paints nothing on those browsers but
  **never touches the DOM**. Matching, navigation, counts, and callbacks keep
  working, so a search box still reports "3 of 12" and can step through results.
- `fallback: 'dom-span'` (opt-in) wraps matches in `<mark>` tags so highlights
  still appear. **This brings back the problems above** on those browsers, so
  only choose it if visible highlights on old browsers matter more to you.

```ts
// Default: never any wrapper tags.
createHighlighter({ root, groups });

// Opt in to <mark> tags where the Highlight API is missing.
createHighlighter({ root, groups, fallback: 'dom-span' });
```

You can check what is in use with `highlighter.activeStrategy`.

## Moving from a wrapper-tag highlighter

If your code currently does something like this:

```js
// Before: rewrites the DOM and must be undone by hand
container.innerHTML = container.innerHTML.replace(re, '<mark class="hit">$&</mark>');
// later…
container.querySelectorAll('mark.hit').forEach((m) => m.replaceWith(...m.childNodes));
container.normalize();
```

```css
mark.hit {
  background: #fff3a0;
}
```

the term-highlight version is:

```js
import { createHighlighter } from 'term-highlight';

const h = createHighlighter({
  root: container,
  groups: [{ name: 'hit', terms: [re], style: { backgroundColor: '#fff3a0' } }],
});
// later…
h.destroy(); // nothing to unwrap: the DOM was never changed
```

Move styles from `mark.hit { … }` into the group's `style` option, and replace
any `querySelectorAll('mark')` calls with `h.getMatches()`, which returns each
match's text, position, and `Range`.
