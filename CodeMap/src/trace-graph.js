// Pure function: build a deterministic, cycle-safe trace tree rooted at a function.
//
// Heuristic (per CLAUDE.md): no AST. We use same-file co-location — a function's
// "callees" are approximated as the other functions defined in the same file,
// ordered by line number. Cycle-safe via a visited set keyed by fn identity.
// Depth is naturally bounded because once every fn in the file is visited, no
// further expansion is possible.

const MAX_DEPTH = 4;

export function fnKey(fn) {
  return `${fn.file}::${fn.name}@${fn.lineNum}`;
}

export function buildTraceTree(rootFn, files) {
  if (!rootFn) return null;
  const byPath = new Map(files.map(f => [f.path, f]));
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
