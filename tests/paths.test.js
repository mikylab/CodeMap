import { test, assertEqual, assertTrue, assertDeepEqual } from './runner.js';
import { findPaths, findReach, buildReverse } from '../src/paths.js';

function mkGraph(adj) {
  const edges = new Map();
  const nodes = new Set();
  for (const [k, vs] of Object.entries(adj)) {
    nodes.add(k);
    edges.set(k, new Set(vs));
    for (const v of vs) nodes.add(v);
  }
  for (const n of nodes) if (!edges.has(n)) edges.set(n, new Set());
  return { nodes: [...nodes], edges };
}

test('paths: shortest path on linear chain', () => {
  const g = mkGraph({ a: ['b'], b: ['c'], c: ['d'] });
  const ps = findPaths(g, 'a', 'd');
  assertEqual(ps.length, 1);
  assertDeepEqual(ps[0].nodes, ['a', 'b', 'c', 'd']);
  assertEqual(ps[0].length, 3);
});

test('paths: multiple shortest paths enumerated', () => {
  const g = mkGraph({ a: ['b', 'c'], b: ['d'], c: ['d'] });
  const ps = findPaths(g, 'a', 'd');
  assertEqual(ps.length, 2);
  assertDeepEqual(ps.map(p => p.nodes), [['a', 'b', 'd'], ['a', 'c', 'd']]);
});

test('paths: depth cap respected', () => {
  const g = mkGraph({ a: ['b'], b: ['c'], c: ['d'], d: ['e'] });
  const ps = findPaths(g, 'a', 'e', { maxDepth: 3 });
  assertEqual(ps.length, 0);
});

test('paths: maxPaths cap', () => {
  // Diamond × 3 — many shortest paths
  const g = mkGraph({
    a: ['b1','b2','b3','b4'],
    b1: ['c'], b2: ['c'], b3: ['c'], b4: ['c'],
  });
  const ps = findPaths(g, 'a', 'c', { maxPaths: 2 });
  assertEqual(ps.length, 2);
});

test('paths: no path returns empty', () => {
  const g = mkGraph({ a: ['b'], c: ['d'] });
  assertEqual(findPaths(g, 'a', 'd').length, 0);
});

test('paths: cycles ignored, paths simple', () => {
  const g = mkGraph({ a: ['b'], b: ['c', 'a'], c: ['d'] });
  const ps = findPaths(g, 'a', 'd');
  assertEqual(ps.length, 1);
  assertDeepEqual(ps[0].nodes, ['a', 'b', 'c', 'd']);
});

test('paths: same start = end', () => {
  const g = mkGraph({ a: ['b'] });
  const ps = findPaths(g, 'a', 'a');
  assertEqual(ps.length, 1);
  assertEqual(ps[0].length, 0);
});

test('reach: forward closure', () => {
  const g = mkGraph({ a: ['b'], b: ['c'], c: ['d'], x: ['y'] });
  const r = findReach(g, 'a');
  assertTrue(r.has('a') && r.has('b') && r.has('c') && r.has('d'));
  assertTrue(!r.has('x') && !r.has('y'));
});

test('reach: reverse closure', () => {
  const g = mkGraph({ a: ['b'], b: ['c'], c: ['d'] });
  const r = findReach(g, 'd', { direction: 'reverse' });
  assertTrue(r.has('a') && r.has('b') && r.has('c') && r.has('d'));
});

test('reverse index built correctly', () => {
  const g = mkGraph({ a: ['c'], b: ['c'] });
  const rev = buildReverse(g);
  assertDeepEqual([...rev.get('c')].sort(), ['a', 'b']);
});
