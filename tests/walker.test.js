import { test, assertEqual, assertDeepEqual, assertTrue, assertFalse } from './runner.js';
import { generateWalk } from '../src/walker.js';

function file(path, opts = {}) {
  const fns = (opts.fns || []).map(f => ({ ...f, file: path }));
  return {
    name: path.split('/').pop(),
    path,
    ext: 'js',
    lang: opts.lang || 'JavaScript',
    langColor: '#F7DF1E',
    lineCount: opts.lineCount ?? 10,
    fns,
    imports: (opts.imports || []).map(lib => ({ from: path, lib })),
    cx: opts.cx ?? 1,
  };
}

function fn(name, cx, lineNum = 1) {
  return { name, file: '', lineNum, lines: 5, cx };
}

function categories(steps) { return steps.map(s => s.category); }

test('walker: empty state yields overview + deps only', () => {
  const steps = generateWalk({ files: [] });
  assertDeepEqual(categories(steps), ['meta', 'deps']);
});

test('walker: overview always present and counts are derived', () => {
  const files = [file('a.js', { lineCount: 10, fns: [fn('x', 1)] }), file('b.py', { lang: 'Python', lineCount: 20, fns: [fn('y', 1), fn('z', 1)] })];
  const [overview] = generateWalk({ files });
  assertEqual(overview.category, 'meta');
  assertTrue(overview.content.includes('2 files'));
  assertTrue(overview.content.includes('30 lines'));
  assertTrue(overview.content.includes('3 functions'));
});

test('walker: entry-points step only when matched', () => {
  const without = generateWalk({ files: [file('lib/foo.js')] });
  assertFalse(categories(without).includes('entry'));
  const with_ = generateWalk({ files: [file('src/index.js'), file('src/server.js'), file('lib/foo.js')] });
  const entry = with_.find(s => s.category === 'entry');
  assertDeepEqual(entry.files, ['src/index.js', 'src/server.js']);
});

test('walker: core modules = top 3 by line count, ties broken by path', () => {
  const files = [
    file('a.js', { lineCount: 50 }),
    file('b.js', { lineCount: 30 }),
    file('c.js', { lineCount: 30 }),
    file('d.js', { lineCount: 10 }),
  ];
  const core = generateWalk({ files }).find(s => s.category === 'core');
  assertDeepEqual(core.files, ['a.js', 'b.js', 'c.js']);
});

test('walker: complexity hotspots only when any fn cx >= 7', () => {
  const cool = generateWalk({ files: [file('a.js', { fns: [fn('x', 6)] })] });
  assertFalse(categories(cool).includes('complexity'));
  const hot = generateWalk({ files: [file('a.js', { fns: [fn('x', 8)] }), file('b.js', { fns: [fn('y', 12)] })] });
  const step = hot.find(s => s.category === 'complexity');
  assertDeepEqual(step.files.sort(), ['a.js', 'b.js']);
  assertEqual(step.fns[0], 'y');
});

test('walker: utilities and config detected by name regex', () => {
  const files = [file('src/utils.js'), file('src/config.js'), file('src/main.js')];
  const cats = categories(generateWalk({ files }));
  assertTrue(cats.includes('utils'));
  assertTrue(cats.includes('config'));
});

test('walker: deps step aggregates and sorts by count desc, lib asc', () => {
  const files = [
    file('a.js', { imports: ['react', 'lodash'] }),
    file('b.js', { imports: ['react'] }),
    file('c.js', { imports: ['axios', 'react'] }),
  ];
  const deps = generateWalk({ files }).find(s => s.category === 'deps');
  assertTrue(deps.content.startsWith('3 unique external libs'));
  assertTrue(deps.content.includes('react (3)'));
});

test('walker: archetype step detects web framework via imports', () => {
  const files = [file('app.js', { imports: ['express'] })];
  const arch = generateWalk({ files }).find(s => s.category === 'archetype');
  assertTrue(!!arch);
  assertTrue(arch.content.includes('Web service'));
  assertTrue(arch.content.includes('express'));
});

test('walker: archetype step omitted when no framework imports match', () => {
  const files = [file('a.js', { imports: ['lodash'] })];
  assertFalse(categories(generateWalk({ files })).includes('archetype'));
});

test('walker: entry step prefers graph candidates with fan-in 0 + reach', () => {
  const files = [
    file('lib/foo.js', { fns: [fn('boot', 1, 1)] }),
    file('lib/bar.js', { fns: [fn('helper', 1, 1)] }),
  ];
  // boot has no callers, calls into helper transitively (reach >= 3).
  const fanIn = new Map([['lib/bar.js::helper@1', 1]]);
  const callsByFn = new Map([
    ['lib/foo.js::boot@1',   [{ name: 'helper', target: 'lib/bar.js::helper@1', resolved: true }]],
    ['lib/bar.js::helper@1', [
      { name: 'a', target: 'lib/bar.js::a@1', resolved: true },
      { name: 'b', target: 'lib/bar.js::b@1', resolved: true },
      { name: 'c', target: 'lib/bar.js::c@1', resolved: true },
    ]],
  ]);
  const entry = generateWalk({ files, fanIn, callsByFn }).find(s => s.category === 'entry');
  assertTrue(!!entry);
  assertTrue(entry.fns.includes('boot'));
});

test('walker: first-hop step lists top callees of entry by fan-out', () => {
  const files = [
    file('main.js', { fns: [fn('start', 1, 1)] }),
    file('a.js', { fns: [fn('aa', 1, 1)] }),
    file('b.js', { fns: [fn('bb', 1, 1)] }),
  ];
  const fanIn = new Map();
  const fanOut = new Map([['a.js::aa@1', 5], ['b.js::bb@1', 1]]);
  const callsByFn = new Map([
    ['main.js::start@1', [
      { name: 'aa', target: 'a.js::aa@1', resolved: true },
      { name: 'bb', target: 'b.js::bb@1', resolved: true },
      { name: 'cc', target: 'c.js::cc@1', resolved: true },
    ]],
    ['a.js::aa@1', [
      { name: 'x', target: 'a.js::x@1', resolved: true },
      { name: 'y', target: 'a.js::y@1', resolved: true },
      { name: 'z', target: 'a.js::z@1', resolved: true },
    ]],
  ]);
  const hop = generateWalk({ files, fanIn, fanOut, callsByFn }).find(s => s.category === 'hop');
  assertTrue(!!hop);
  assertEqual(hop.fns[0], 'aa');
  assertTrue(hop.title.includes('start'));
});

test('walker: core step uses importer count when available', () => {
  const files = [
    file('big.js', { lineCount: 1000 }),
    file('hub.js', { lineCount: 50 }),
    file('a.js'), file('b.js'), file('c.js'),
  ];
  const fileImporters = new Map([
    ['hub.js', new Set(['a.js', 'b.js', 'c.js'])],
    ['big.js', new Set()],
  ]);
  const core = generateWalk({ files, fileImporters }).find(s => s.category === 'core');
  assertEqual(core.files[0], 'hub.js');
  assertTrue(core.content.includes('importer'));
});

test('walker: hotspot weighting puts high-fan-in above higher cx alone', () => {
  const files = [
    file('a.js', { fns: [fn('rare', 12, 1)] }),
    file('b.js', { fns: [fn('hot',   8, 1)] }),
  ];
  const fanIn = new Map([['b.js::hot@1', 10]]);
  const step = generateWalk({ files, fanIn }).find(s => s.category === 'complexity');
  // hot weight = 8 * 11 = 88; rare weight = 12 * 1 = 12.
  assertEqual(step.fns[0], 'hot');
});

test('walker: boundary step lists files importing IO/network/DB libs', () => {
  const files = [
    file('db.js', { imports: ['psycopg2'] }),
    file('pure.js', { imports: ['lodash'] }),
  ];
  const step = generateWalk({ files }).find(s => s.category === 'boundary');
  assertTrue(!!step);
  assertDeepEqual(step.files, ['db.js']);
});

test('walker: orphan step lists unimported files with no callers', () => {
  const files = [
    file('lonely.js', { fns: [fn('foo', 1, 1)] }),
    file('used.js',   { fns: [fn('bar', 1, 1)] }),
    file('main.js',   { fns: [fn('start', 1, 1)] }),
    file('tests/x.test.js', { fns: [fn('t', 1, 1)] }),
  ];
  const fileImporters = new Map([['used.js', new Set(['main.js'])]]);
  const fanIn = new Map([['used.js::bar@1', 1]]);
  const step = generateWalk({ files, fileImporters, fanIn }).find(s => s.category === 'orphans');
  assertTrue(!!step);
  assertDeepEqual(step.files, ['lonely.js']); // entry + test + used.js excluded
});

test('walker: deterministic — same input yields equal output', () => {
  const files = [
    file('src/index.js', { lineCount: 40, fns: [fn('main', 9)], imports: ['react'] }),
    file('src/utils.js', { lineCount: 20, imports: ['lodash'] }),
    file('src/config.js', { lineCount: 5 }),
  ];
  const a = generateWalk({ files });
  const b = generateWalk({ files });
  assertDeepEqual(a, b);
});
