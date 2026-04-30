import { test, assertEqual, assertDeepEqual } from './runner.js';
import { analyze } from '../src/analyzer.js';

function file(path, imports) {
  return { path, fns: [], imports: imports.map(lib => ({ from: path, lib })) };
}

test('analyzer: shared import creates exactly one edge', () => {
  const { edges } = analyze([file('a.js', ['react']), file('b.js', ['react'])]);
  assertEqual(edges.length, 1);
  assertDeepEqual([edges[0].a, edges[0].b].sort(), ['a.js', 'b.js']);
});

test('analyzer: no shared imports => no edges', () => {
  const { edges } = analyze([file('a.js', ['react']), file('b.js', ['vue'])]);
  assertEqual(edges.length, 0);
});

test('analyzer: three files sharing a lib produce three pairwise edges', () => {
  const { edges } = analyze([file('a.js', ['x']), file('b.js', ['x']), file('c.js', ['x'])]);
  assertEqual(edges.length, 3);
});

test('analyzer: two files sharing two libs still produce one edge', () => {
  const { edges } = analyze([file('a.js', ['x', 'y']), file('b.js', ['x', 'y'])]);
  assertEqual(edges.length, 1);
});

test('analyzer: connectivity = total edge degree', () => {
  const { degree } = analyze([
    file('a.js', ['x']),
    file('b.js', ['x', 'y']),
    file('c.js', ['y']),
  ]);
  assertEqual(degree.get('a.js'), 1);
  assertEqual(degree.get('b.js'), 2);
  assertEqual(degree.get('c.js'), 1);
});

test('analyzer: libToPaths indexes libs to importing files', () => {
  const { libToPaths } = analyze([file('a.js', ['react']), file('b.js', ['react', 'vue'])]);
  assertDeepEqual([...libToPaths.get('react')].sort(), ['a.js', 'b.js']);
  assertDeepEqual([...libToPaths.get('vue')], ['b.js']);
});
