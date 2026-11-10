# Production readiness

State of release 1.2.0 (merged in PR #5), measured on 2026-11-10 on an Apple
M1 Pro (macOS 24.6, arm64, Node 20.10). Nothing below is claimed unless a
command or test shows it. "Not verified" means exactly that.

## Verification pipeline (all run locally and passing)

| Gate                  | Command                 | Result                                                                                                                                                     |
| --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types (strict)        | `npm run typecheck`     | 0 errors (src, tests, e2e, scripts)                                                                                                                        |
| Lint                  | `npm run lint`          | 0 errors, 0 warnings                                                                                                                                       |
| Format                | `npm run format:check`  | clean                                                                                                                                                      |
| Unit/integration      | `npm run test:coverage` | 184 tests passing                                                                                                                                          |
| Coverage              | (same)                  | 97.2% statements/lines, 91.9% branches, 98.4% functions; thresholds enforced at 95/95/95/88                                                                |
| Build                 | `npm run build`         | ESM, CJS, `.d.ts`, `.d.cts`, source maps                                                                                                                   |
| Smoke                 | `npm run smoke`         | ESM + CJS import of `dist/`                                                                                                                                |
| Packed artifact       | `npm run pack:check`    | tarball contents, version match, ESM import, CJS require, `exports` blocks deep imports, strict TypeScript consumers under `node16` ESM and CJS resolution |
| Browsers              | `npx playwright test`   | Chromium 158, Firefox 159, WebKit 27.2: 37 passed, 2 skipped (heap test is Chromium-only)                                                                  |
| Production deps audit | `npm run audit:prod`    | 0 vulnerabilities (the package has no runtime dependencies)                                                                                                |

## Requirement status

Legend: **Done** = implemented and tested; **Partial**; **Not done**.

### P0 correctness and lifecycle

| Requirement                                 | Status               | Evidence                                                                                                                                                                                                                       |
| ------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `destroy()` releases everything, idempotent | Done                 | `test/lifecycle.test.ts` (registry, style tag, observer, pending debounce, pointer listeners, dom-span DOM restoration, references released)                                                                                   |
| Defined behaviour after destroy             | Done                 | Same file; documented in `docs/guide.md`                                                                                                                                                                                       |
| Removed roots                               | Done (css-highlight) | Highlights cleared, nothing pinned in the registry; re-attach needs `update()` (a `MutationObserver` cannot detect it)                                                                                                         |
| No leaks over create/destroy cycles         | Done                 | 200 cycles in Vitest (registry/style counts) and a Chromium heap test (negative control confirmed: it fails when matches are retained)                                                                                         |
| Multi-instance isolation                    | Done                 | Same roots/names, several groups, destroy one; unique ids even across duplicate library copies                                                                                                                                 |
| Dynamic updates                             | Done                 | `test/dynamic.test.ts`: repeated `setTerms`, `updateGroup`, add/remove, priority, style, clear, hidden groups, current-match retention, autoUpdate (insert/remove/characterData/debounce/no feedback loop for both strategies) |
| DOM correctness                             | Done                 | nested/multi-node/inline spans, comments, empty nodes, script/style/noscript/textarea, `exclude`, detached roots, inserted/removed nodes, block boundaries                                                                     |
| Block boundary semantics                    | Done                 | Default unchanged (matches may cross blocks); `blockBoundaries: true` opt-in. Tag-based, not layout-based                                                                                                                      |
| Unicode                                     | Done                 | accents, emoji/surrogates (including a pair split across nodes), Cyrillic/Greek/CJK/Arabic/Hebrew/Thai, combining marks, zero-width, offsets validated against `textContent`                                                   |
| Unicode case folding beyond the BMP         | Not done             | Documented limitation (`i` flag without `u`)                                                                                                                                                                                   |
| Error handling                              | Done                 | invalid root/groups/terms/priority/wholeWord/patterns throw `TypeError`; atomic rollback; constructor failure cleans up; forced unsupported strategy throws a clear error                                                      |
| Hidden (CSS) elements skipped by default    | Not done             | Would need computed-style reads per element; use `exclude`. Documented                                                                                                                                                         |

### P1 performance

| Requirement                        | Status          | Notes                                                                                                                                                                                                 |
| ---------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Benchmark suite                    | Done            | `npm run bench` -> `bench/RESULTS.md` (p50/p95, 1k/10k/50k/100k words and a 1M-character stress document; 3 browsers; hardware and versions recorded)                                                 |
| Fixed algorithmic defects          | Done            | Overlap resolution O(n²) -> O(n log n) (100k matches: ~8 s -> <1 s in jsdom); stack overflow at ~150k matches; empty-group updates skip the DOM walk (Chromium `clear` at 100k words: 29 ms -> 15 ms) |
| Incremental matching / range reuse | Not done        | Every update re-walks and rebuilds all ranges. Costs are linear and measured; see below                                                                                                               |
| Debounced observer processing      | Already present | `autoUpdate: { debounce }`, microtask by default; burst test added                                                                                                                                    |
| Caching                            | Not done        | Evaluated, not added: invalidation risk outweighs the gain at these timings                                                                                                                           |
| Regression guard                   | Done (coarse)   | `e2e/perf.spec.ts` budgets are about 8-10x the slowest measured engine; they catch algorithmic regressions, not 20% slowdowns                                                                         |

Measured (p50 / p95 ms, Apple M1 Pro; `bench/RESULTS.md` has everything):

| Dataset (ranges)       | Chromium 158 initial | Firefox 159 initial | WebKit 27.2 initial | Chromium rapid typing x8 |
| ---------------------- | -------------------- | ------------------- | ------------------- | ------------------------ |
| 10,000 words (~4k)     | 3.7 / 8.6            | 18 / 32             | 9 / 14              | 16.4 / 17.8              |
| 100,000 words (~40k)   | 38 / 50.5            | 115 / 203           | 348 / 353           | 264 / 274                |
| 1,000,000 chars (~69k) | 66.8 / 83.6          | 176 / 251           | 952 / 960           | 508 / 527                |

Main-thread blocking = the synchronous call time (the library is synchronous).
Calls over 50 ms on the largest sets: Chromium 29 of 40 (stress), Firefox 33 of
40, WebKit 40 of 40. Large documents therefore need debouncing, which
`connectSearchInput` does by default (120 ms). A `performance.memory` reading in
Chromium: about 3 MB of JS heap for 40k live ranges, back to near baseline after
`destroy()`. Firefox and WebKit do not expose heap size to pages, so memory is not
measured there. Timer resolution is about 1 ms in those two.

### P1 browser compatibility and security

| Requirement                                                                             | Status                     | Notes                                                                                                                                 |
| --------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| API detection, partial support                                                          | Done                       | Requires constructor + `add()` and registry + `set()`/`delete()`; tested with mocks in Vitest and in real browsers                    |
| Unsupported browsers don't fail silently                                                | Done                       | `auto` -> `none` (documented, `activeStrategy` exposed); forced `css-highlight` throws                                                |
| DOM fallback                                                                            | Pre-existing, now verified | `dom-span` already existed; wrap/restore round-trip tested in jsdom and all three browsers                                            |
| Playwright: render, overlap, priority, click/hover, navigation, updates, cleanup, mocks | Done                       | `e2e/` (pixels sampled from real screenshots)                                                                                         |
| Regex safety                                                                            | Documented                 | ReDoS cannot be prevented in-library; no claim of protection. `maxMatches` caps count only. Worker-based matching **not implemented** |
| Literal terms never act as regex                                                        | Done                       | tested with metacharacters                                                                                                            |
| HTML/CSS safety                                                                         | Done                       | no `innerHTML`-family calls in `src/`; style declarations validated (injection test); group names escaped; no observer feedback loop  |

### P2 DX, docs, release

| Requirement                        | Status                       | Notes                                                                                                                                                                |
| ---------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript, public types    | Done                         | Consumer compile test (ESM + CJS resolution) in `pack:check`; new options documented in `types.ts`                                                                   |
| Docs                               | Done                         | README, `docs/guide.md`, `docs/frameworks.md`, `docs/security.md`                                                                                                    |
| React / Angular / vanilla examples | Partial                      | Written and reviewed but **not compiled or run** (no React/Angular dependency here). Vanilla example not exercised by a test either                                  |
| CI                                 | Done                         | Run on GitHub for PR #5 and green: Node 18/20/22 unit jobs, Chromium/Firefox/WebKit job on Ubuntu, packed-tarball check, production audit                            |
| Packed artifact validation         | Done                         | `scripts/pack-check.mjs`                                                                                                                                             |
| Semver, changelog, SECURITY.md     | Done                         | `CHANGELOG.md` [Unreleased]; version not bumped (release decision is yours)                                                                                          |
| npm provenance                     | Configured, **not verified** | `release.yml` passes `--provenance` (manual run, `npm` environment); a local `npm publish` cannot produce provenance, and only a real publish from Actions proves it |

## Known risks and limitations

1. **Dev-tooling advisories.** `npm audit` reports 14 findings (2 critical:
   `vitest` and `tinypool`; 11 moderate; 1 low). All are in test/lint tooling
   that is never published. The fix is Vitest 5, which needs a newer Node than
   the one used here (20.10: it fails on `node:util.styleText`). CI audits dev
   dependencies informationally and gates on production dependencies.
2. **Performance on very large documents** in Firefox and especially WebKit
   (hundreds of ms at 100k words). No incremental update path exists.
3. **Only the latest browser versions** were tested. The documented minimums
   (Chrome 105, Safari 17.2, Firefox 140) are from MDN, not from this repo's tests.
4. **Windows and macOS CI** are not covered: the GitHub matrix is Ubuntu only (Node
   18/20/22 and Chromium/Firefox/WebKit all passed on PR #5). Local runs were Node
   20.10 on macOS only. WebKit on Linux may differ from Safari on macOS/iOS.
5. `blockBoundaries` is tag-based; `<br>` is not a boundary; CSS-hidden text is
   scanned unless excluded.
6. `strategy: 'dom-span'` remains legacy and mutates the DOM (restored on cleanup).
7. Invalid term types now throw instead of being ignored (the only behaviour
   change for existing callers; see CHANGELOG).
