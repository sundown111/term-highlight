# Security notes

Report vulnerabilities privately; see [`SECURITY.md`](../SECURITY.md).

## Regular expressions

`RegExp` terms are executed by the browser's own regex engine on the main
thread. **term-highlight cannot make an unsafe pattern safe.**

- A pattern with catastrophic backtracking (for example `/(a+)+$/` against a long
  run of `a` followed by another character) can freeze the page for as long as
  the engine takes, and nothing in this library can interrupt it. Simple
  validation (length caps, rejecting nested quantifiers) reduces risk but is not a
  guarantee and is deliberately not claimed.
- **Never pass untrusted input as a `RegExp`.** Literal strings (the default
  for `string` / `string[]` terms, and for `connectSearchInput` unless you set
  `allowRegex`) are escaped with `escapeRegExp` and cannot be interpreted as
  patterns; this is covered by tests (`a.b`, `a+b`, `(a|b)`, `[x]`, `a\b`).
- If you must run user patterns, run them somewhere you can kill them (for
  example a Web Worker that you terminate on a timeout) and pass only the
  resulting literal strings to term-highlight. A worker-based matcher is **not
  implemented** in this library.
- `maxMatches` stops collecting after N matches. It bounds memory and the
  number of ranges, but it does **not** bound regex execution time.
- Terms inside one group are combined with alternation into a single regex. Two
  terms that cannot coexist in one pattern (for example duplicate named capture
  groups) are rejected with a `TypeError` when the group is added.

## DOM and CSS

- Search terms are never parsed as HTML. The `css-highlight` and `none`
  strategies never write to the highlighted DOM; `dom-span` creates `<mark>`
  elements with `createElement` and `createTextNode` (text is never parsed as markup). The code base contains
  no `innerHTML`, `outerHTML` or `insertAdjacentHTML`.
- Group `style` values are written into a generated `<style>` element. Each
  declaration is validated: property names must be plain identifiers, values may
  not contain `; { } < > \` newlines, comments, `@import` or `expression(`,
  quotes and parentheses must balance, and where `CSS.supports` exists the browser
  must accept the declaration. Rejected declarations are dropped, so one
  malformed style cannot rewrite another group's rule or the page's CSS.
  This is a defence for configuration mistakes; do not treat it as a sandbox for
  hostile style objects.
- Group names are escaped with `CSS.escape` (with a fallback) before use in
  `::highlight()`, and `dom-span` class names are generated, never derived from
  group names.
- The `MutationObserver` is disconnected while the highlighter renders, so the
  library cannot trigger itself in a loop.

## Dependencies

The published package has **no runtime dependencies**. `npm audit --omit=dev`
reports 0 vulnerabilities. Development tooling (Vitest/Playwright/ESLint) is not
shipped; see `PRODUCTION_READINESS.md` for the current dev-audit status.
