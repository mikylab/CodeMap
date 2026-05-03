// Builds an execution-path tree from regex-inferred call edges (no AST).
// Children of a node are functions that node calls, resolved via analyzer.js
// to same-file (high), import-disambiguated (med), or single-name (low) targets.
// Unresolved calls become leaf placeholders so the heuristic's confidence is visible.

const MAX_DEPTH = 4;

export function fnKey(fn) {
  return `${fn.file}::${fn.name}@${fn.lineNum}`;
}

export function buildTraceTree(rootFn, callsByFn, fnByKey) {
  if (!rootFn) return null;
  const visited = new Set();
  return expand(rootFn, callsByFn, fnByKey, visited, 0, 'high', false);
}

function expand(fn, callsByFn, fnByKey, visited, depth, confidence, ambiguous) {
  const key = fnKey(fn);
  const node = {
    fn,
    children: [],
    confidence,
    ambiguous,
    unresolved: false,
    cycle: false,
  };
  if (visited.has(key)) { node.cycle = true; return node; }
  visited.add(key);
  if (depth >= MAX_DEPTH) return node;
  const edges = callsByFn ? callsByFn.get(key) : null;
  if (!edges || !edges.length) return node;
  const ordered = edges.slice().sort((a, b) => a.name.localeCompare(b.name));
  for (const e of ordered) {
    if (!e.resolved) {
      node.children.push(unresolvedNode(e.name));
      continue;
    }
    const target = fnByKey ? fnByKey.get(e.target) : null;
    if (!target) { node.children.push(unresolvedNode(e.name)); continue; }
    node.children.push(expand(target, callsByFn, fnByKey, visited, depth + 1, e.confidence, e.ambiguous));
  }
  return node;
}

function unresolvedNode(name) {
  return {
    fn: { name, file: '(unresolved)', lineNum: 0, lines: 0, cx: 1 },
    children: [],
    confidence: 'low',
    ambiguous: false,
    unresolved: true,
    cycle: false,
  };
}
