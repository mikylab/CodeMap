import { test, assertEqual, assertDeepEqual, assertTrue } from './runner.js';
import { buildTraceTree, fnKey, isEntryPoint, pickEntryForFile } from '../src/trace-graph.js';

function fn(name, file, lineNum, cx = 1) {
  return { name, file, lineNum, lines: 5, cx, calls: [] };
}
function callsMap(entries) { return new Map(entries); }
function fnByKey(fns) { return new Map(fns.map(f => [fnKey(f), f])); }

test('trace: null root returns null', () => {
  assertEqual(buildTraceTree(null, new Map(), new Map()), null);
});

test('trace: root with no calls has empty children and reach=1', () => {
  const root = fn('solo', 'a.js', 1);
  const tree = buildTraceTree(root, callsMap([[fnKey(root), []]]), fnByKey([root]));
  assertEqual(tree.fn.name, 'solo');
  assertDeepEqual(tree.children, []);
  assertEqual(tree.subtree.reach, 1);
  assertEqual(tree.subtree.depth, 0);
});

test('trace: resolved callees become children with bubbled reach', () => {
  const a = fn('a', 'x.js', 1);
  const b = fn('b', 'x.js', 5);
  const c = fn('c', 'x.js', 9);
  const calls = callsMap([
    [fnKey(a), [
      { name: 'b', target: fnKey(b), confidence: 'high', ambiguous: false, resolved: true },
      { name: 'c', target: fnKey(c), confidence: 'high', ambiguous: false, resolved: true },
    ]],
    [fnKey(b), []], [fnKey(c), []],
  ]);
  const tree = buildTraceTree(a, calls, fnByKey([a, b, c]));
  assertDeepEqual(tree.children.map(n => n.fn.name), ['b', 'c']);
  assertEqual(tree.subtree.reach, 3);
  assertEqual(tree.subtree.depth, 1);
});

test('trace: unresolved calls collapse into extCount, not children', () => {
  const a = fn('a', 'x.js', 1);
  const calls = callsMap([
    [fnKey(a), [
      { name: 'mystery', target: null, confidence: 'low', ambiguous: false, resolved: false },
      { name: 'getElementById', target: null, confidence: 'low', ambiguous: false, resolved: false },
    ]],
  ]);
  const tree = buildTraceTree(a, calls, fnByKey([a]));
  assertEqual(tree.children.length, 0);
  assertEqual(tree.extCount, 2);
  assertTrue(tree.extNames.includes('mystery'));
  assertTrue(tree.extNames.includes('getElementById'));
});

test('trace: hotspots count fns with cx >= 7 in subtree', () => {
  const a = fn('a', 'x.js', 1, 1);
  const b = fn('b', 'x.js', 5, 9);  // hotspot
  const c = fn('c', 'x.js', 9, 12); // hotspot
  const calls = callsMap([
    [fnKey(a), [
      { name: 'b', target: fnKey(b), confidence: 'high', ambiguous: false, resolved: true },
      { name: 'c', target: fnKey(c), confidence: 'high', ambiguous: false, resolved: true },
    ]],
    [fnKey(b), []], [fnKey(c), []],
  ]);
  const tree = buildTraceTree(a, calls, fnByKey([a, b, c]));
  assertEqual(tree.subtree.hotspots, 2);
});

test('trace: cycle-safe — repeated fn marked as cycle, not re-expanded', () => {
  const a = fn('a', 'x.js', 1);
  const b = fn('b', 'x.js', 2);
  const calls = callsMap([
    [fnKey(a), [{ name: 'b', target: fnKey(b), confidence: 'high', ambiguous: false, resolved: true }]],
    [fnKey(b), [{ name: 'a', target: fnKey(a), confidence: 'high', ambiguous: false, resolved: true }]],
  ]);
  const tree = buildTraceTree(a, calls, fnByKey([a, b]));
  assertEqual(tree.children.length, 1);
  assertEqual(tree.children[0].fn.name, 'b');
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
    [fnKey(b), []], [fnKey(c), []],
  ]);
  const tree = buildTraceTree(a, calls, fnByKey([a, b, c]));
  assertDeepEqual(tree.children.map(n => n.fn.name), ['b', 'c']);
});

test('trace: tracks distinct files reached in subtree', () => {
  const a = fn('a', 'x.js', 1);
  const b = fn('b', 'y.js', 1);
  const calls = callsMap([
    [fnKey(a), [{ name: 'b', target: fnKey(b), confidence: 'med', ambiguous: false, resolved: true }]],
    [fnKey(b), []],
  ]);
  const tree = buildTraceTree(a, calls, fnByKey([a, b]));
  assertEqual(tree.subtree.files.size, 2);
});

test('isEntryPoint: function called from another file is an entry', () => {
  const a = fn('handler', 'route.js', 1);
  const callers = new Map([[fnKey(a), [{ from: 'main.js::start@1', confidence: 'med', ambiguous: false }]]]);
  assertTrue(isEntryPoint(a, callers));
});

test('isEntryPoint: function with entry-like name is an entry', () => {
  const a = fn('main', 'm.js', 1);
  assertTrue(isEntryPoint(a, new Map([[fnKey(a), [{ from: 'm.js::other@5', confidence: 'high', ambiguous: false }]]])));
});

test('isEntryPoint: only-internal-callers non-entry-named function is NOT an entry', () => {
  const a = fn('helper', 'm.js', 1);
  const callers = new Map([[fnKey(a), [{ from: 'm.js::other@5', confidence: 'high', ambiguous: false }]]]);
  assertEqual(isEntryPoint(a, callers), false);
});

test('pickEntryForFile: picks entry with highest reach', () => {
  const main = fn('main', 'm.js', 1);
  const helper = fn('helper', 'm.js', 5);
  const sub = fn('sub', 'm.js', 9);
  const file = { path: 'm.js', fns: [main, helper, sub] };
  const calls = callsMap([
    [fnKey(main), [
      { name: 'helper', target: fnKey(helper), confidence: 'high', ambiguous: false, resolved: true },
      { name: 'sub', target: fnKey(sub), confidence: 'high', ambiguous: false, resolved: true },
    ]],
    [fnKey(helper), []], [fnKey(sub), []],
  ]);
  const callers = new Map();
  const picked = pickEntryForFile(file, calls, callers, fnByKey([main, helper, sub]));
  assertEqual(picked.name, 'main');
});

test('fnKey: uniqueness across same-name fns in different files', () => {
  assertTrue(fnKey({ name: 'x', file: 'a.js', lineNum: 1 }) !==
             fnKey({ name: 'x', file: 'b.js', lineNum: 1 }));
});
