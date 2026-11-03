// CJS smoke test: load the BUILT output via `require` and assert the public
// surface resolves and works. Run after `npm run build`.
const assert = require('node:assert/strict');
const mod = require('../dist/index.cjs');

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
assert.equal(mod.supportsCssHighlight(), false, 'no CSS Highlight API in Node');

console.log('CJS smoke OK');
