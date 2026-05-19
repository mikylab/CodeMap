import { test, assertEqual, assertDeepEqual, assertTrue } from './runner.js';
import { computeLayout, computeEdges, hitTest } from '../src/graph.js';

function file(path, opts = {}) {
  return {
    name: path.split('/').pop(),
    path,
    ext: opts.ext || 'js',
    lang: opts.lang || 'JavaScript',
    langColor: opts.langColor || '#F7DF1E',
    lineCount: opts.lineCount ?? 100,
    fns: [],
    imports: (opts.imports || []).map(lib => ({ from: path, lib })),
    cx: 1,
  };
}

test('graph: computeLayout — empty files returns []', () => {
  assertDeepEqual(computeLayout([], 400, 400), []);
});

test('graph: computeLayout — N files placed on a circle, deterministic', () => {
  const files = [file('a.js'), file('b.js'), file('c.js'), file('d.js')];
  const a = computeLayout(files, 400, 400);
  const b = computeLayout(files, 400, 400);
  assertDeepEqual(a, b);
  assertEqual(a.length, 4);
  // First node at angle -π/2 → y < center
  assertTrue(a[0].y < 200);
  // Radii grow with sqrt(lineCount)
  const big = computeLayout([file('big.js', { lineCount: 1200 })], 400, 400);
  assertTrue(big[0].r > a[0].r);
});

test('graph: computeEdges — shared external import creates an edge', () => {
  const files = [
    file('a.js', { imports: ['react'] }),
    file('b.js', { imports: ['react'] }),
  ];
  const edges = computeEdges(files);
  assertEqual(edges.length, 1);
  assertEqual(edges[0].a, 'a.js');
  assertEqual(edges[0].b, 'b.js');
  assertEqual(edges[0].kind, 'import');
  assertDeepEqual(edges[0].libs, ['react']);
});

test('graph: computeEdges — same language creates a lang edge', () => {
  const files = [
    file('a.js', { lang: 'JavaScript' }),
    file('b.js', { lang: 'JavaScript' }),
  ];
  const edges = computeEdges(files);
  assertEqual(edges.length, 1);
  assertEqual(edges[0].kind, 'lang');
});

test('graph: import edge takes priority over lang-only when both apply', () => {
  const files = [
    file('a.js', { lang: 'JavaScript', imports: ['react'] }),
    file('b.js', { lang: 'JavaScript', imports: ['react'] }),
  ];
  const edges = computeEdges(files);
  assertEqual(edges.length, 1);
  assertEqual(edges[0].kind, 'import');
});

test('graph: computeEdges — different langs without shared imports → no edge', () => {
  const files = [
    file('a.js', { lang: 'JavaScript', imports: ['react'] }),
    file('b.py', { lang: 'Python',     imports: ['numpy'] }),
  ];
  assertEqual(computeEdges(files).length, 0);
});

test('graph: computeEdges — shared import across different langs still produces an edge', () => {
  const files = [
    file('a.js', { lang: 'JavaScript', imports: ['lodash'] }),
    file('b.py', { lang: 'Python',     imports: ['lodash'] }),
  ];
  assertEqual(computeEdges(files).length, 1);
});

test('graph: computeEdges — no duplicate edge when files share both lang and import', () => {
  const files = [
    file('a.js', { lang: 'JavaScript', imports: ['react'] }),
    file('b.js', { lang: 'JavaScript', imports: ['react'] }),
  ];
  assertEqual(computeEdges(files).length, 1);
});

test('graph: hitTest — picks node when within radius', () => {
  const layout = [
    { path: 'a.js', x: 100, y: 100, r: 10 },
    { path: 'b.js', x: 200, y: 100, r: 10 },
  ];
  assertEqual(hitTest(layout, 100, 100).path, 'a.js');
  assertEqual(hitTest(layout, 200, 105).path, 'b.js');
  assertEqual(hitTest(layout, 0, 0), null);
});
