import { test, assertEqual, assertDeepEqual, assertTrue, assertFalse } from './runner.js';
import { analyze } from '../src/analyzer.js';
import { fnKey } from '../src/trace-graph.js';

function file(path, imports) {
  return { path, fns: [], imports: imports.map(lib => ({ from: path, lib })), localImports: [] };
}

function fileFns(path, fns, localImports = []) {
  return { path, fns, imports: [], localImports };
}

function pf(name, file, lineNum, calls = []) {
  return { name, file, lineNum, lines: 5, cx: 1, calls };
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

test('callgraph: same-file resolution is high confidence', () => {
  const a = pf('a', 'x.js', 1, ['b']);
  const b = pf('b', 'x.js', 5);
  const { callsByFn } = analyze([fileFns('x.js', [a, b])]);
  const edges = callsByFn.get(fnKey(a));
  assertEqual(edges.length, 1);
  assertEqual(edges[0].confidence, 'high');
  assertEqual(edges[0].target, fnKey(b));
});

test('callgraph: cross-file resolution via local import is medium confidence', () => {
  const a = pf('a', 'src/x.js', 1, ['helper']);
  const helper = pf('helper', 'src/util.js', 1);
  const fA = fileFns('src/x.js', [a], ['./util']);
  const fU = fileFns('src/util.js', [helper]);
  const { callsByFn } = analyze([fA, fU]);
  const edges = callsByFn.get(fnKey(a));
  assertEqual(edges[0].confidence, 'med');
  assertEqual(edges[0].target, fnKey(helper));
});

test('callgraph: ambiguous when multiple files define same name with no import', () => {
  const a = pf('a', 'x.js', 1, ['shared']);
  const s1 = pf('shared', 'a.js', 1);
  const s2 = pf('shared', 'b.js', 1);
  const { callsByFn } = analyze([fileFns('x.js', [a]), fileFns('a.js', [s1]), fileFns('b.js', [s2])]);
  const edge = callsByFn.get(fnKey(a))[0];
  assertEqual(edge.ambiguous, true);
  assertEqual(edge.candidates.length, 2);
});

test('callgraph: unresolved call when name has no definition', () => {
  const a = pf('a', 'x.js', 1, ['mystery']);
  const { callsByFn } = analyze([fileFns('x.js', [a])]);
  const edge = callsByFn.get(fnKey(a))[0];
  assertEqual(edge.resolved, false);
  assertEqual(edge.target, null);
});

test('callgraph: fan-in / fan-out tallies', () => {
  const a = pf('a', 'x.js', 1, ['b', 'c']);
  const b = pf('b', 'x.js', 5);
  const c = pf('c', 'x.js', 9, ['b']);
  const { fanIn, fanOut } = analyze([fileFns('x.js', [a, b, c])]);
  assertEqual(fanOut.get(fnKey(a)), 2);
  assertEqual(fanOut.get(fnKey(c)), 1);
  assertEqual(fanIn.get(fnKey(b)), 2);
});

test('callgraph: same-file beats imported when both exist', () => {
  const a = pf('a', 'x.js', 1, ['b']);
  const localB = pf('b', 'x.js', 5);
  const importedB = pf('b', 'y.js', 5);
  const { callsByFn } = analyze([fileFns('x.js', [a, localB], ['./y']), fileFns('y.js', [importedB])]);
  const edge = callsByFn.get(fnKey(a))[0];
  assertEqual(edge.target, fnKey(localB));
  assertEqual(edge.confidence, 'high');
});

test('analyze: resolveIndex contains functions, classes, imports by name', () => {
  const files = [
    { path: 'a.py', ext: 'py', imports: [{ from: 'a.py', lib: 'torch' }], localImports: [],
      fns: [
        { name: 'handle_req', file: 'a.py', lineNum: 5 },
        { name: 'User', file: 'a.py', lineNum: 12 },
      ] },
    { path: 'b.py', ext: 'py', imports: [], localImports: [],
      fns: [{ name: 'handle_req', file: 'b.py', lineNum: 8 }] },
  ];
  const result = analyze(files);
  const handleEntries = result.resolveIndex.get('handle_req') || [];
  assertEqual(handleEntries.length, 2);
  assertTrue(handleEntries.every(e => e.kind === 'function'));
  const userEntries = result.resolveIndex.get('User') || [];
  assertEqual(userEntries[0].kind, 'class');
  const torchEntries = result.resolveIndex.get('torch') || [];
  assertEqual(torchEntries.length, 1);
  assertEqual(torchEntries[0].kind, 'import');
  assertEqual(torchEntries[0].file, 'a.py');
});
