# Contributing to term-highlight

Thanks for your interest in improving term-highlight! This document explains how
to get set up and what is expected of contributions.

## Getting started

```bash
git clone https://github.com/sundown111/term-highlight.git
cd term-highlight
npm install
```

Node.js `>=18` is required.

## Development scripts

| Script                  | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `npm run typecheck`     | Type-check the project with `tsc --noEmit`.              |
| `npm run lint`          | Lint with ESLint (typescript-eslint).                    |
| `npm run format`        | Format all files with Prettier.                          |
| `npm run format:check`  | Verify formatting without writing.                       |
| `npm test`              | Run the Vitest suite once (jsdom environment).           |
| `npm run test:watch`    | Run Vitest in watch mode.                                |
| `npm run test:coverage` | Run the suite with a V8 coverage report.                 |
| `npm run build`         | Build ESM + CJS + `.d.ts` output with tsup.              |
| `npm run smoke`         | Import the built output via both `import` and `require`. |
| `npm run verify`        | Typecheck + lint + test + build + smoke (the full gate). |

Before opening a pull request, please run `npm run verify` and make sure it
passes cleanly. CI runs the same checks on every push and PR.

## Architecture overview

The package deliberately decouples **matching** from **rendering**:

- `src/matcher.ts` — walks the DOM, builds the flat text + offset map, compiles
  one regex per group, resolves overlaps, and produces `Range`s. It never
  touches styling or the registry.
- `src/renderers/*` — two implementations of the `Renderer` interface
  (`css-highlight.ts`, `dom-span.ts`) plus `detect.ts` for `auto` resolution.
- `src/highlighter.ts` — orchestrates matching + rendering and exposes the
  public API.

When adding behavior, keep that separation: matching logic goes in the matcher,
painting logic goes in a renderer, and anything shared between the two strategies
belongs in the `Highlighter`.

## Testing expectations

- New features and bug fixes need tests. Cover edge cases, not just the happy
  path (cross-element matches, overlaps, empty roots, `destroy()` cleanliness).
- Both renderer strategies must stay at parity for the shared feature surface
  (toggle, `showOnly`, navigation). The `css-highlight` strategy is exercised in
  jsdom via the fake Highlight API in `test/helpers/fakeHighlightApi.ts`.

## Commit and PR guidelines

- Keep pull requests focused; one logical change per PR.
- Update `CHANGELOG.md` under the `Unreleased` heading.
- Update the `README.md` API reference if you change the public API.

## Reporting bugs

Please open an issue with a minimal reproduction (ideally the HTML input, the
group configuration, the strategy, and what you expected vs. observed).

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](./LICENSE).
