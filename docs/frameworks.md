# Framework integration

term-highlight never inserts elements, so it coexists with React, Angular, Vue
and similar renderers: their reconciliation is not disturbed. Three rules apply
everywhere:

1. **Create in the browser, after mount.** `createHighlighter` needs a real
   element. Importing the package on the server is safe (see [SSR](guide.md#ssr)).
2. **Destroy on unmount.** `destroy()` is idempotent and releases the observer,
   listeners, `CSS.highlights` entries and the injected `<style>` tag.
3. **Update, don't recreate.** Use `setTerms()` / `updateGroup()` when search
   terms change, and `autoUpdate` (or `update()`) when the content changes.

| Example                                                                                   | Notes                                            |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [`examples/frameworks/vanilla.html`](../examples/frameworks/vanilla.html)                 | Plain ES module with a search box.               |
| [`examples/frameworks/react.tsx`](../examples/frameworks/react.tsx)                       | `useTermHighlight` hook, Strict Mode safe.       |
| [`examples/frameworks/angular.directive.ts`](../examples/frameworks/angular.directive.ts) | Standalone directive, outside NgZone, SSR guard. |

**Verification status:** the library behaviour these examples rely on (repeated
create/destroy, idempotent destroy, `setTerms`, `autoUpdate`) is covered by the
test suite and the Playwright suite. The React and Angular files themselves are
not compiled or run by this repository's CI, because it has no React or Angular
dependency; treat them as reviewed templates.

## Lifecycle

```
mount ──▶ createHighlighter({ root, groups, autoUpdate })
change terms ──▶ highlighter.setTerms(name, terms)
content changed (framework re-render) ──▶ automatic with autoUpdate, or highlighter.update()
unmount ──▶ highlighter.destroy()
```

## MutationObserver behaviour

With `autoUpdate`, one observer watches `childList`, `subtree` and
`characterData` on the root. It is disconnected while the highlighter re-renders
and reconnected afterwards, so the `dom-span` strategy (which edits the DOM)
does not trigger itself; with `css-highlight` the DOM is never modified at all.
Bursts of mutations collapse into one pass (a microtask by default, or the
`debounce` you pass). Attribute-only changes are not observed. If the root is
removed from the document, highlights are cleared and not re-registered (see the
[guide](guide.md#lifecycle)).
