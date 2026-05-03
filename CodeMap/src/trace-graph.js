// Per CLAUDE.md: no AST. We approximate a function's callees as the other
// functions defined in the same file, ordered by line number — a deliberate
// heuristic, not a true call graph.

const MAX_DEPTH = 4;

export function fnKey(fn) {
  return `${fn.file}::${fn.name}@${fn.lineNum}`;
}

export function buildTraceTree(rootFn, byPath) {
  if (!rootFn) return null;
  const visited = new Set([fnKey(rootFn)]);
  return expand(rootFn, byPath, visited, 0);
}

function expand(fn, byPath, visited, depth) {
  const node = { fn, children: [] };
  if (depth >= MAX_DEPTH) return node;
  const file = byPath.get(fn.file);
  if (!file) return node;
  const siblings = file.fns
    .filter(f => !visited.has(fnKey(f)))
    .sort((a, b) => a.lineNum - b.lineNum || a.name.localeCompare(b.name));
  for (const s of siblings) visited.add(fnKey(s));
  for (const s of siblings) node.children.push(expand(s, byPath, visited, depth + 1));
  return node;
}
