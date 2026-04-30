import { test, assertEqual, assertDeepEqual, assertTrue, assertFalse } from './runner.js';
import { generateWalk } from '../src/walker.js';

function file(path, opts = {}) {
  return {
    name: path.split('/').pop(),
    path,
    ext: 'js',
    lang: opts.lang || 'JavaScript',
    langColor: '#F7DF1E',
    lineCount: opts.lineCount ?? 10,
    fns: opts.fns || [],
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
