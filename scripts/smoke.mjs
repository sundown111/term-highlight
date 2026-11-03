// ESM smoke test: import the BUILT output via `import` and assert the public
// surface resolves and works. Run after `npm run build`.
import assert from 'node:assert/strict';
import * as mod from '../dist/index.js';

assert.equal(typeof mod.createHighlighter, 'function', 'createHighlighter export');
assert.equal(typeof mod.escapeRegExp, 'function', 'escapeRegExp export');
assert.equal(typeof mod.buildGroupRegExp, 'function', 'buildGroupRegExp export');
assert.equal(typeof mod.computeMatches, 'function', 'computeMatches export');
assert.equal(typeof mod.supportsCssHighlight, 'function', 'supportsCssHighlight export');
assert.equal(typeof mod.parseQuery, 'function', 'parseQuery export');
assert.equal(typeof mod.connectSearchInput, 'function', 'connectSearchInput export');
assert.equal(typeof mod.foldDiacritics, 'function', 'foldDiacritics export');

assert.equal(mod.escapeRegExp('a.b*c'), 'a\\.b\\*c', 'escapeRegExp behavior');
assert.deepEqual(mod.parseQuery('red "big fox"'), ['red', 'big fox'], 'parseQuery behavior');
assert.equal(mod.foldDiacritics('café'), 'cafe', 'foldDiacritics behavior');
// No DOM here, but supportsCssHighlight must not throw in a plain Node runtime.
assert.equal(mod.supportsCssHighlight(), false, 'no CSS Highlight API in Node');

console.log('ESM smoke OK');
