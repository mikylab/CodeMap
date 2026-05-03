import { test, assertEqual, assertDeepEqual, assertTrue } from './runner.js';
import { buildTraceTree, fnKey } from '../src/trace-graph.js';

function fn(name, file, lineNum, cx = 1) {
  return { name, file, lineNum, lines: 5, cx };
}

function makeFile(path, fns) {
  return { name: path.split('/').pop(), path, ext: 'js', lang: 'JavaScript', langColor: '#000', lineCount: 100, fns, imports: [], cx: 1 };
}

test('trace: null root returns null', () => {
  assertEqual(buildTraceTree(null, []), null);
});

test('trace: root with no co-located fns has empty children', () => {
  const root = fn('solo', 'a.js', 1);
  const files = [makeFile('a.js', [root])];
  const tree = buildTraceTree(root, files);
  assertEqual(tree.fn.name, 'solo');
  assertDeepEqual(tree.children, []);
});

test('trace: children are same-file fns ordered by lineNum, root excluded', () => {
  const a = fn('a', 'x.js', 5);
  const b = fn('b', 'x.js', 1);
  const c = fn('c', 'x.js', 10);
  const files = [makeFile('x.js', [a, b, c])];
  const tree = buildTraceTree(a, files);
  assertDeepEqual(tree.children.map(n => n.fn.name), ['b', 'c']);
});

test('trace: cycle-safe — children of children do not re-include visited fns', () => {
  const a = fn('a', 'x.js', 1);
  const b = fn('b', 'x.js', 2);
  const files = [makeFile('x.js', [a, b])];
  const tree = buildTraceTree(a, files);
  assertEqual(tree.children.length, 1);
  assertEqual(tree.children[0].fn.name, 'b');
  assertDeepEqual(tree.children[0].children, []);
});

test('trace: deterministic — repeated calls produce identical trees', () => {
  const a = fn('a', 'x.js', 1);
  const b = fn('b', 'x.js', 2);
  const c = fn('c', 'x.js', 3);
  const files = [makeFile('x.js', [c, a, b])];
  const t1 = buildTraceTree(a, files);
  const t2 = buildTraceTree(a, files);
  assertDeepEqual(JSON.parse(JSON.stringify(t1)), JSON.parse(JSON.stringify(t2)));
});

test('trace: missing file (root not in files) yields empty children', () => {
  const root = fn('orphan', 'gone.js', 1);
  const tree = buildTraceTree(root, []);
  assertDeepEqual(tree.children, []);
});

test('trace: fnKey uniqueness across same-name fns in different files', () => {
  assertTrue(fnKey({ name: 'x', file: 'a.js', lineNum: 1 }) !==
             fnKey({ name: 'x', file: 'b.js', lineNum: 1 }));
});
