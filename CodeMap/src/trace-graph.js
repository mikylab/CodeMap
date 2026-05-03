// Builds an execution map for a function: a DAG of in-codebase callees.
// External / unresolved / library calls are collapsed into an `extCount`
// per node so the map shows what *your* code does, not every DOM call.
// Subtree stats (reach, depth, hotspots) accompany each node so the renderer
// can annotate maintainability without re-walking.

const MAX_DEPTH = 6;

export function fnKey(fn) {
  return `${fn.file}::${fn.name}@${fn.lineNum}`;
}

export function buildTraceTree(rootFn, callsByFn, fnByKey) {
  if (!rootFn) return null;
  return expand(rootFn, callsByFn, fnByKey, new Set(), 0, 'high', false);
}

function expand(fn, callsByFn, fnByKey, visited, depth, confidence, ambiguous) {
  const key = fnKey(fn);
  const node = {
    fn,
    children: [],
    confidence,
    ambiguous,
    cycle: false,
    extCount: 0,           // count of external/unresolved calls
    extNames: [],          // sample of external names (for tooltip)
    ambCount: 0,           // count of ambiguous in-codebase calls
    subtree: { reach: 1, depth: 0, hotspots: fn.cx >= 7 ? 1 : 0, files: new Set([fn.file]) },
  };
  if (visited.has(key)) { node.cycle = true; return node; }
  visited.add(key);

  const edges = callsByFn ? callsByFn.get(key) : null;
  if (edges && edges.length) {
    const ordered = edges.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const e of ordered) {
      if (!e.resolved) {
        node.extCount++;
        if (node.extNames.length < 8) node.extNames.push(e.name);
        continue;
      }
      const target = fnByKey ? fnByKey.get(e.target) : null;
      if (!target) { node.extCount++; if (node.extNames.length < 8) node.extNames.push(e.name); continue; }
      if (depth + 1 >= MAX_DEPTH) {
        // record reach but don't expand further
        node.subtree.reach += 1;
        if (target.cx >= 7) node.subtree.hotspots += 1;
        node.subtree.files.add(target.file);
        continue;
      }
      const child = expand(target, callsByFn, fnByKey, visited, depth + 1, e.confidence, e.ambiguous);
      if (e.ambiguous) node.ambCount++;
      node.children.push(child);
      // bubble subtree stats up
      node.subtree.reach += child.subtree.reach;
      node.subtree.hotspots += child.subtree.hotspots;
      node.subtree.depth = Math.max(node.subtree.depth, 1 + child.subtree.depth);
      for (const f of child.subtree.files) node.subtree.files.add(f);
    }
  }
  return node;
}

// Returns `true` if a function looks like an entry-point of its file.
// Heuristic: called from another file (cross-file fan-in), OR not called at all,
// OR has an entry-like name (main, init, run, start, handler, default, render*).
export function isEntryPoint(fn, callersByFn) {
  const callers = callersByFn.get(fnKey(fn)) || [];
  const hasExternalCaller = callers.some(c => {
    const callerFile = c.from.split('::')[0];
    return callerFile !== fn.file;
  });
  if (hasExternalCaller) return true;
  if (callers.length === 0) return true;
  if (/^(main|init|run|start|setup|boot|bootstrap|render|handle|on[A-Z]|use[A-Z]|default)/.test(fn.name)) return true;
  return false;
}

// Pick the most-relevant entry function in a file. Prefers entry points that
// reach the most code; falls back to the first defined function.
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
