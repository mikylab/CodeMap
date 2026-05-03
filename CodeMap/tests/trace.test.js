import { test, assertEqual, assertDeepEqual, assertTrue } from './runner.js';
import { buildTraceTree, fnKey } from '../src/trace-graph.js';

function fn(name, file, lineNum, cx = 1) {
  return { name, file, lineNum, lines: 5, cx, calls: [] };
}

function callsMap(entries) {
  // entries: [[fnKey, [{name, target, confidence, ambiguous?, resolved}]], ...]
  return new Map(entries);
}

function fnByKey(fns) { return new Map(fns.map(f => [fnKey(f), f])); }

test('trace: null root returns null', () => {
  assertEqual(buildTraceTree(null, new Map(), new Map()), null);
});

test('trace: root with no calls has empty children', () => {
  const root = fn('solo', 'a.js', 1);
  const tree = buildTraceTree(root, callsMap([[fnKey(root), []]]), fnByKey([root]));
  assertEqual(tree.fn.name, 'solo');
  assertDeepEqual(tree.children, []);
});

test('trace: resolved callees become children', () => {
  const a = fn('a', 'x.js', 1);
  const b = fn('b', 'x.js', 5);
  const c = fn('c', 'x.js', 9);
  const calls = callsMap([
    [fnKey(a), [
      { name: 'b', target: fnKey(b), confidence: 'high', ambiguous: false, resolved: true },
      { name: 'c', target: fnKey(c), confidence: 'high', ambiguous: false, resolved: true },
    ]],
    [fnKey(b), []],
    [fnKey(c), []],
  ]);
  const tree = buildTraceTree(a, calls, fnByKey([a, b, c]));
  assertDeepEqual(tree.children.map(n => n.fn.name), ['b', 'c']);
});

test('trace: unresolved call appears as leaf placeholder', () => {
  const a = fn('a', 'x.js', 1);
  const calls = callsMap([
    [fnKey(a), [
      { name: 'mystery', target: null, confidence: 'low', ambiguous: false, resolved: false },
    ]],
  ]);
  const tree = buildTraceTree(a, calls, fnByKey([a]));
  assertEqual(tree.children.length, 1);
  assertTrue(tree.children[0].unresolved);
  assertEqual(tree.children[0].fn.name, 'mystery');
});

test('trace: ambiguous edges propagate the ambiguous flag', () => {
  const a = fn('a', 'x.js', 1);
  const b = fn('b', 'y.js', 1);
  const calls = callsMap([
    [fnKey(a), [{ name: 'b', target: fnKey(b), confidence: 'low', ambiguous: true, resolved: true }]],
    [fnKey(b), []],
  ]);
  const tree = buildTraceTree(a, calls, fnByKey([a, b]));
  assertTrue(tree.children[0].ambiguous);
});

test('trace: cycle-safe — visited fn not re-expanded', () => {
  const a = fn('a', 'x.js', 1);
  const b = fn('b', 'x.js', 2);
  const calls = callsMap([
    [fnKey(a), [{ name: 'b', target: fnKey(b), confidence: 'high', ambiguous: false, resolved: true }]],
    [fnKey(b), [{ name: 'a', target: fnKey(a), confidence: 'high', ambiguous: false, resolved: true }]],
  ]);
  const tree = buildTraceTree(a, calls, fnByKey([a, b]));
  assertEqual(tree.children.length, 1);
  assertEqual(tree.children[0].fn.name, 'b');
  // b's call to a should be detected as a cycle, not expanded
  assertEqual(tree.children[0].children.length, 1);
  assertTrue(tree.children[0].children[0].cycle);
});

test('trace: deterministic — children sorted by call name', () => {
  const a = fn('a', 'x.js', 1);
  const b = fn('b', 'x.js', 2);
  const c = fn('c', 'x.js', 3);
  const calls = callsMap([
    [fnKey(a), [
      { name: 'c', target: fnKey(c), confidence: 'high', ambiguous: false, resolved: true },
      { name: 'b', target: fnKey(b), confidence: 'high', ambiguous: false, resolved: true },
    ]],
    [fnKey(b), []],
    [fnKey(c), []],
  ]);
  const t1 = buildTraceTree(a, calls, fnByKey([a, b, c]));
  const t2 = buildTraceTree(a, calls, fnByKey([a, b, c]));
  assertDeepEqual(JSON.parse(JSON.stringify(t1)), JSON.parse(JSON.stringify(t2)));
  assertDeepEqual(t1.children.map(n => n.fn.name), ['b', 'c']);
});

test('trace: fnKey uniqueness across same-name fns in different files', () => {
  assertTrue(fnKey({ name: 'x', file: 'a.js', lineNum: 1 }) !==
             fnKey({ name: 'x', file: 'b.js', lineNum: 1 }));
});
