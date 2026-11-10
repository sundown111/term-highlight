// Reproducible browser benchmark. Usage:
//   npm run build && node bench/run.mjs [--browsers=chromium,firefox,webkit] [--quick]
// Writes bench/results.json and bench/RESULTS.md. Numbers are whatever this
// machine measured; nothing is hard-coded.
import { chromium, firefox, webkit } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const quick = !!args.quick;
const engines = { chromium, firefox, webkit };
const names = String(args.browsers ?? 'chromium,firefox,webkit').split(',');

const datasets = [
  { name: 'small', words: 1_000, runs: quick ? 5 : 20 },
  { name: 'medium', words: 10_000, runs: quick ? 5 : 15 },
  { name: 'large', words: 50_000, runs: quick ? 3 : 10 },
  { name: 'very_large', words: 100_000, runs: quick ? 3 : 8 },
  { name: 'stress', characters: 1_000_000, runs: quick ? 3 : 5 },
];

const server = spawn('node', ['e2e/server.mjs'], {
  stdio: 'ignore',
  env: { ...process.env, PORT: '4180' },
});
await new Promise((r) => setTimeout(r, 600));

/** Runs inside the page. Returns per-operation sample arrays (ms) plus counters. */
async function pageBench(spec) {
  const { lib } = window;
  const vocab = [
    'alpha',
    'bravo',
    'charlie',
    'delta',
    'echo',
    'foxtrot',
    'golf',
    'hotel',
    'india',
    'juliet',
    'kilo',
    'lima',
    'mike',
    'november',
    'oscar',
    'papa',
    'quebec',
    'romeo',
    'sierra',
    'tango',
  ];
  let seed = 42;
  const rnd = (n) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;

  function build(root) {
    root.textContent = '';
    const targetChars = spec.characters ?? Infinity;
    let words = 0,
      chars = 0;
    while (words < (spec.words ?? Infinity) && chars < targetChars) {
      const p = document.createElement('p');
      const parts = [];
      for (
        let i = 0;
        i < 40 && words < (spec.words ?? Infinity) && chars < targetChars;
        i++, words++
      ) {
        const w = vocab[rnd(vocab.length)];
        parts.push(i % 9 === 0 ? `<b>${w}</b>` : w);
        chars += w.length + 1;
      }
      p.innerHTML = parts.join(' ');
      root.appendChild(p);
    }
    return { words, chars };
  }

  const time = (fn) => {
    const t = performance.now();
    const r = fn();
    return [performance.now() - t, r];
  };
  const samples = {};
  const push = (k, v) => (samples[k] ??= []).push(v);

  const root = document.createElement('div');
  document.body.appendChild(root);
  const size = build(root);
  const mem = () => {
    window.gc?.();
    return performance.memory ? performance.memory.usedJSHeapSize : null;
  };
  const heapBefore = mem();
  let heapLive = null;
  let ranges = 0,
    domMutations = 0;

  for (let run = 0; run < spec.runs; run++) {
    const groups = [
      { name: 'a', terms: ['alpha', 'bravo'] },
      { name: 'b', terms: ['charlie'], wholeWord: true },
      { name: 'c', terms: [/del\w+/, 'echo'] },
    ];
    let h;
    let [t] = time(() => (h = lib.createHighlighter({ root, groups })));
    push('initial_highlighting', t);
    ranges = h.getMatches().length;

    [t] = time(() => h.setTerms('a', ['golf', 'hotel']));
    push('search_term_update', t);

    [t] = time(() => {
      h.updateGroup('a', { terms: ['india'] });
      h.updateGroup('b', { terms: ['juliet'] });
      h.updateGroup('c', { terms: ['kilo'] });
    });
    push('multiple_group_update', t);

    [t] = time(() => h.setTerms('a', [/\b(?:lima|mike)\b/]));
    push('regex_matching', t);

    // Rapid typing: successive prefixes of a word, one update per keystroke.
    const word = 'november';
    [t] = time(() => {
      for (let i = 1; i <= word.length; i++) h.setTerms('a', [word.slice(0, i)]);
    });
    push('rapid_search_updates_8_keystrokes', t);

    // DOM mutation: append a paragraph, then re-run (what autoUpdate does after a mutation).
    const extra = document.createElement('p');
    extra.textContent = 'alpha kilo november '.repeat(20);
    root.appendChild(extra);
    domMutations++;
    [t] = time(() => h.update());
    push('dom_mutation_update', t);
    extra.remove();

    [t] = time(() => h.clear());
    push('clear_highlights', t);

    h.setTerms('a', ['alpha']);
    heapLive = mem();
    [t] = time(() => h.destroy());
    push('instance_destruction', t);
  }
  const heapAfter = mem();
  return {
    size,
    samples,
    ranges,
    domMutations,
    heapBefore,
    heapLive,
    heapAfter,
    ua: navigator.userAgent,
  };
}

const q = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
};
const results = {
  date: new Date().toISOString(),
  hardware: {
    cpu: os.cpus()[0].model,
    cores: os.cpus().length,
    memGB: Math.round(os.totalmem() / 2 ** 30),
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  },
  browsers: {},
};

for (const name of names) {
  const browser = await engines[name].launch(
    name === 'chromium' ? { args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] } : {}
  );
  const version = browser.version();
  results.browsers[name] = { version, datasets: {} };
  for (const ds of datasets) {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:4180/e2e/fixture.html');
    await page.waitForFunction(() => window.ready === true);
    const r = await page.evaluate(pageBench, ds);
    const ops = {};
    for (const [k, v] of Object.entries(r.samples))
      ops[k] = { p50: +q(v, 0.5).toFixed(2), p95: +q(v, 0.95).toFixed(2), runs: v.length };
    results.browsers[name].datasets[ds.name] = {
      words: r.size.words,
      characters: r.size.chars,
      ranges: r.ranges,
      domMutations: r.domMutations,
      // Samples over 50 ms: the threshold browsers use for a "long task" (main-thread blocking).
      callsOver50ms: Object.values(r.samples)
        .flat()
        .filter((v) => v > 50).length,
      totalCalls: Object.values(r.samples).flat().length,
      heapMB:
        r.heapBefore == null
          ? null
          : {
              baseline: +(r.heapBefore / 2 ** 20).toFixed(1),
              whileHighlighted: +(r.heapLive / 2 ** 20).toFixed(1),
              afterDestroy: +(r.heapAfter / 2 ** 20).toFixed(1),
            },
      ops,
    };
    console.log(name, ds.name, JSON.stringify(ops.initial_highlighting));
    await page.close();
  }
  await browser.close();
}
server.kill();

writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(results, null, 2));
let md =
  `# Benchmark results\n\nGenerated ${results.date} by \`node bench/run.mjs${quick ? ' --quick' : ''}\`.\n\n` +
  `**Hardware:** ${results.hardware.cpu}, ${results.hardware.cores} cores, ${results.hardware.memGB} GB RAM, ${results.hardware.platform}.\n\n` +
  `Times are wall-clock milliseconds of the synchronous call (the main thread is blocked for exactly that long). p50/p95 over the listed runs. ` +
  `Heap figures are Chromium-only (\`performance.memory\` with precise info and forced GC); other engines report n/a. Firefox and WebKit coarsen \`performance.now()\` (about 1 ms), so sub-millisecond values there are rough. These are single-machine measurements, not guarantees.\n`;
for (const [name, b] of Object.entries(results.browsers)) {
  md += `\n## ${name} ${b.version}\n`;
  for (const [dn, d] of Object.entries(b.datasets)) {
    md += `\n### ${dn} (${d.words.toLocaleString()} words, ${d.characters.toLocaleString()} chars; ${d.ranges.toLocaleString()} ranges in initial 3-group pass; calls >50 ms: ${d.callsOver50ms}/${d.totalCalls}; heap MB baseline/highlighted/after destroy: ${d.heapMB ? `${d.heapMB.baseline}/${d.heapMB.whileHighlighted}/${d.heapMB.afterDestroy}` : 'n/a'})\n\n| operation | p50 ms | p95 ms | runs |\n|---|---:|---:|---:|\n`;
    for (const [op, v] of Object.entries(d.ops))
      md += `| ${op} | ${v.p50} | ${v.p95} | ${v.runs} |\n`;
  }
}
writeFileSync(new URL('./RESULTS.md', import.meta.url), md);
console.log('wrote bench/results.json and bench/RESULTS.md');
