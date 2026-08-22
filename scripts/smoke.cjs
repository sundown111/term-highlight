// CJS smoke test: load the BUILT output via `require` and assert the public
// surface resolves and works. Run after `npm run build`.
const assert = require('node:assert/strict');
const mod = require('../dist/index.cjs');

assert.equal(typeof mod.createHighlighter, 'function', 'createHighlighter export');
assert.equal(typeof mod.escapeRegExp, 'function', 'escapeRegExp export');
assert.equal(typeof mod.buildGroupRegExp, 'function', 'buildGroupRegExp export');
assert.equal(typeof mod.computeMatches, 'function', 'computeMatches export');
assert.equal(typeof mod.supportsCssHighlight, 'function', 'supportsCssHighlight export');

assert.equal(mod.escapeRegExp('a.b*c'), 'a\\.b\\*c', 'escapeRegExp behavior');
assert.equal(mod.supportsCssHighlight(), false, 'no CSS Highlight API in Node');

console.log('CJS smoke OK');
