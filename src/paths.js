// Phase 9c — Path painter core. Pure graph algorithms over a generic shape:
//   graph: { nodes: NodeKey[], edges: Map<NodeKey, Set<NodeKey>> }
// `edges` is the forward adjacency. Reverse traversal builds its own reverse
// index on demand.
//
// findPaths — every shortest simple path from start to end, capped.
// findReach — forward (or reverse) transitive closure.

const DEFAULTS = { maxPaths: 20, maxDepth: 12 };

export function findPaths(graph, startKey, endKey, opts = {}) {
  const { maxPaths, maxDepth } = { ...DEFAULTS, ...opts };
  if (!graph || !graph.edges) return [];
  if (startKey === endKey) return [{ nodes: [startKey], edges: [], length: 0 }];
  if (!graph.edges.has(startKey)) return [];

  // BFS with parent tracking, recording every parent at the shortest depth.
  // After BFS, reconstruct paths via depth-bounded enumeration of parent chains.
  const depth = new Map([[startKey, 0]]);
  const parents = new Map(); // child -> Set<parent>
  const queue = [startKey];
  let foundDepth = -1;
  while (queue.length) {
    const u = queue.shift();
    const ud = depth.get(u);
    if (foundDepth >= 0 && ud >= foundDepth) continue;
    if (ud >= maxDepth) continue;
    const nexts = [...(graph.edges.get(u) || [])].sort();
    for (const v of nexts) {
      if (!depth.has(v)) {
        depth.set(v, ud + 1);
        let ps = parents.get(v);
        if (!ps) parents.set(v, ps = new Set());
        ps.add(u);
        if (v === endKey) foundDepth = ud + 1;
        else queue.push(v);
      } else if (depth.get(v) === ud + 1) {
        let ps = parents.get(v);
        if (!ps) parents.set(v, ps = new Set());
        ps.add(u);
      }
    }
  }
  if (!parents.has(endKey)) return [];

  const paths = [];
  function reconstruct(node, acc) {
    if (paths.length >= maxPaths) return;
    if (node === startKey) {
      const nodes = [startKey, ...acc.slice().reverse()];
      const edges = [];
      for (let i = 0; i < nodes.length - 1; i++) edges.push({ from: nodes[i], to: nodes[i + 1] });
      paths.push({ nodes, edges, length: nodes.length - 1 });
      return;
    }
    const ps = [...(parents.get(node) || [])].sort();
    for (const p of ps) {
      if (acc.includes(p)) continue;
      acc.push(node);
      reconstruct(p, acc);
      acc.pop();
      if (paths.length >= maxPaths) return;
    }
  }
  reconstruct(endKey, []);
  paths.sort((a, b) => a.length - b.length || compareNodeArr(a.nodes, b.nodes));
  return paths.slice(0, maxPaths);
}

function compareNodeArr(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = a[i].localeCompare(b[i]);
    if (c !== 0) return c;
  }
  return a.length - b.length;
}

export function findReach(graph, startKey, opts = {}) {
  const { maxDepth, direction } = { ...DEFAULTS, direction: 'forward', ...opts };
  if (!graph || !graph.edges) return new Set();
  const adj = direction === 'reverse' ? buildReverse(graph) : graph.edges;
  const seen = new Set([startKey]);
  const queue = [{ k: startKey, d: 0 }];
  while (queue.length) {
    const { k, d } = queue.shift();
    if (d >= maxDepth) continue;
    for (const v of (adj.get(k) || [])) {
      if (seen.has(v)) continue;
      seen.add(v);
      queue.push({ k: v, d: d + 1 });
    }
  }
  return seen;
}

export function buildReverse(graph) {
  const rev = new Map();
  for (const [from, set] of graph.edges) {
    for (const to of set) {
      let s = rev.get(to);
      if (!s) rev.set(to, s = new Set());
      s.add(from);
    }
  }
  return rev;
}

// --- adapters from STATE ---------------------------------------------------

export function fnGraphFromState(state) {
  const edges = new Map();
  const nodes = [];
  for (const [from, list] of (state.callsByFn || new Map())) {
    nodes.push(from);
    const set = edges.get(from) || new Set();
    for (const e of list) if (e.target) set.add(e.target);
    edges.set(from, set);
  }
  return { nodes, edges };
}

export function fileGraphFromState(state) {
  const edges = new Map();
  const nodes = [];
  for (const [from, set] of (state.fileImports || new Map())) {
    nodes.push(from);
    edges.set(from, new Set(set));
  }
  return { nodes, edges };
}
