// Validates the artifact that would actually be published: packs the project,
// installs the tarball into a scratch project and exercises ESM, CJS and
// TypeScript consumers. Run after `npm run build`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'th-pack-'));
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

try {
  // 1. What goes into the tarball.
  const [info] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', work], repo));
  const files = info.files.map((f) => f.path);
  const has = (p) => files.includes(p);
  for (const required of [
    'package.json',
    'README.md',
    'LICENSE',
    'dist/index.js',
    'dist/index.cjs',
    'dist/index.d.ts',
    'dist/index.d.cts',
    'dist/index.js.map',
    'dist/index.cjs.map',
  ]) {
    assert.ok(has(required), `tarball is missing ${required}`);
  }
  const forbidden =
    /^(src|test|e2e|bench|scripts|coverage|examples|docs|\.github|node_modules)\/|^(tsconfig|vitest\.config|playwright\.config|eslint\.config|tsup\.config)|\.test\./;
  const leaked = files.filter((f) => forbidden.test(f));
  assert.deepEqual(leaked, [], `development files leaked into the tarball: ${leaked.join(', ')}`);
  assert.equal(info.version, pkg.version, 'packed version differs from package.json');

  // 2. Source maps reference sources that exist in the map (self-contained).
  for (const m of ['dist/index.js.map', 'dist/index.cjs.map']) {
    const map = JSON.parse(readFileSync(join(repo, m), 'utf8'));
    assert.ok(map.sources?.length && map.sourcesContent?.length, `${m} should embed sources`);
  }

  // 3. Install the tarball into a clean consumer project.
  const consumer = join(work, 'consumer');
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'consumer', version: '1.0.0', private: true, type: 'module' })
  );
  const tarball = join(work, info.filename);
  run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], consumer);
  const installed = JSON.parse(
    readFileSync(join(consumer, 'node_modules', pkg.name, 'package.json'), 'utf8')
  );
  assert.equal(installed.version, pkg.version, 'installed version differs from repository version');

  // 4. ESM import, CJS require and subpath behaviour.
  writeFileSync(
    join(consumer, 'esm.mjs'),
    `import { createHighlighter, supportsCssHighlight, parseQuery } from '${pkg.name}';
     import assert from 'node:assert/strict';
     assert.equal(typeof createHighlighter, 'function');
     assert.equal(supportsCssHighlight(), false);
     assert.deepEqual(parseQuery('a "b c"'), ['a', 'b c']);
     const pj = await import('${pkg.name}/package.json', { with: { type: 'json' } }).catch(() => null);
     console.log('esm ok', pj ? pj.default.version : '');`
  );
  writeFileSync(
    join(consumer, 'cjs.cjs'),
    `const assert = require('node:assert/strict');
     const m = require('${pkg.name}');
     assert.equal(typeof m.createHighlighter, 'function');
     assert.equal(m.escapeRegExp('a.b'), 'a\\\\.b');
     assert.equal(require('${pkg.name}/package.json').version, '${pkg.version}');
     assert.throws(() => require('${pkg.name}/dist/index.cjs'), /not defined by "exports"|ERR_PACKAGE_PATH_NOT_EXPORTED/);
     console.log('cjs ok');`
  );
  console.log(run('node', ['esm.mjs'], consumer).trim());
  console.log(run('node', ['cjs.cjs'], consumer).trim());

  // 5. TypeScript consumers (strict) under both ESM and CJS resolution.
  const tsc = join(repo, 'node_modules', 'typescript', 'bin', 'tsc');
  const source = `import { createHighlighter, type Highlighter, type HighlighterOptions, type MatchInfo } from '${pkg.name}';
const options: HighlighterOptions = { root: document.body, groups: [{ name: 'a', terms: ['x', /y/], priority: 1 }], onHighlightClick: (m: MatchInfo, e: MouseEvent) => void [m.text, e.clientX] };
const h: Highlighter = createHighlighter(options);
const n: number = h.getStats().total;
const s: 'css-highlight' | 'dom-span' | 'none' = h.activeStrategy;
export { n, s };
// @ts-expect-error unknown option must be rejected
createHighlighter({ root: document.body, groups: [], nope: 1 });
`;
  for (const [name, moduleKind, type] of [
    ['esm', 'node16', 'module'],
    ['cjs', 'node16', 'commonjs'],
  ]) {
    const dir = join(work, `ts-${name}`);
    mkdirSync(join(dir, 'node_modules'), { recursive: true });
    run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], dir);
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: `ts-${name}`,
        private: true,
        type,
        dependencies: { [pkg.name]: tarball },
      })
    );
    writeFileSync(join(dir, 'index.ts'), source);
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: moduleKind,
          moduleResolution: moduleKind,
          target: 'ES2020',
          lib: ['ES2020', 'DOM'],
          noEmit: true,
          skipLibCheck: false,
        },
        files: ['index.ts'],
      })
    );
    run('node', [tsc, '-p', dir], dir);
    console.log(`typescript (${name}) ok`);
  }
  console.log(`pack check OK: ${info.filename} (${info.size} bytes, ${files.length} files)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
