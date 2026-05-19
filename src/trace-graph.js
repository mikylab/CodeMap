// Builds an execution map for a function: a DAG of in-codebase callees.
// External / unresolved / library calls are collapsed into an `extCount`
// per node so the map shows what *your* code does, not every DOM call.

const MAX_DEPTH = 20;

export function fnKey(fn) {
  return `${fn.file}::${fn.name}@${fn.lineNum}`;
}

export function buildTraceTree(rootFn, callsByFn, fnByKey) {
  if (!rootFn) return null;
  const visited = new Set();
  function expand(fn, depth, confidence, ambiguous) {
    const key = fnKey(fn);
    const node = {
      fn,
      children: [],
      confidence,
      ambiguous,
      cycle: false,
      extCount: 0,
      extNames: [],
      ambCount: 0,
      subtree: { reach: 1, depth: 0, hotspots: fn.cx >= 7 ? 1 : 0, files: new Set([fn.file]) },
    };
    if (visited.has(key)) { node.cycle = true; return node; }
    visited.add(key);

    const edges = callsByFn.get(key);
    if (!edges || !edges.length) return node;
    const ordered = edges.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const e of ordered) {
      if (!e.resolved) {
        node.extCount++;
        if (node.extNames.length < 8) node.extNames.push(e.name);
        continue;
      }
      const target = fnByKey.get(e.target);
      if (!target) {
        node.extCount++;
        if (node.extNames.length < 8) node.extNames.push(e.name);
        continue;
      }
      if (depth + 1 >= MAX_DEPTH) {
        node.subtree.reach += 1;
        if (target.cx >= 7) node.subtree.hotspots += 1;
        node.subtree.files.add(target.file);
        continue;
      }
      const child = expand(target, depth + 1, e.confidence, e.ambiguous);
      if (e.ambiguous) node.ambCount++;
      node.children.push(child);
      node.subtree.reach += child.subtree.reach;
      node.subtree.hotspots += child.subtree.hotspots;
      node.subtree.depth = Math.max(node.subtree.depth, 1 + child.subtree.depth);
      for (const f of child.subtree.files) node.subtree.files.add(f);
    }
    return node;
  }
  return expand(rootFn, 0, 'high', false);
}

// True if `fn` is plausibly an entry point of its file: called from outside,
// uncalled, or matches an entry-shaped name.
export function isEntryPoint(fn, callersByFn) {
  const callers = callersByFn.get(fnKey(fn)) || [];
  if (callers.length === 0) return true;
  if (callers.some(c => c.fromFile && c.fromFile !== fn.file)) return true;
  return /^(main|init|run|start|setup|boot|bootstrap|render|handle|on[A-Z]|use[A-Z]|default)/.test(fn.name);
}

export function pickEntryForFile(file, callsByFn, callersByFn, fnByKey) {
  const entries = file.fns.filter(fn => isEntryPoint(fn, callersByFn));
  const pool = entries.length ? entries : file.fns;
  if (!pool.length) return null;
  let best = pool[0], bestReach = -1;
  for (const fn of pool) {
    const tree = buildTraceTree(fn, callsByFn, fnByKey);
    const reach = tree ? tree.subtree.reach : 1;
    if (reach > bestReach) { best = fn; bestReach = reach; }
  }
  return best;
}
