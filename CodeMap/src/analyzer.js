import { mark, measure } from './perf.js';
import { fnKey } from './trace-graph.js';

export function analyze(files) {
  const t0 = mark();
  const libToPaths = new Map();
  for (const f of files) {
    for (const im of f.imports) {
      let set = libToPaths.get(im.lib);
      if (!set) libToPaths.set(im.lib, set = new Set());
      set.add(f.path);
    }
  }

  const edges = [];
  for (const paths of libToPaths.values()) {
    if (paths.size < 2) continue;
    const arr = [...paths].sort();
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        edges.push({ a: arr[i], b: arr[j] });
      }
    }
  }

  // Files sharing N libs would generate N duplicates per pair; dedupe.
  const seen = new Set();
  const unique = edges.filter(e => {
    const k = `${e.a}|${e.b}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const degree = new Map();
  for (const e of unique) {
    degree.set(e.a, (degree.get(e.a) || 0) + 1);
    degree.set(e.b, (degree.get(e.b) || 0) + 1);
  }

  const callGraph = buildCallGraph(files);

  measure('analyze', t0, `files=${files.length} libs=${libToPaths.size} edges=${unique.length} callEdges=${callGraph.callEdges.length}`);
  return { edges: unique, degree, libToPaths, ...callGraph };
}

const RESOLVE_EXTS = ['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java'];

function buildCallGraph(files) {
  const fnsByName = new Map();
  for (const f of files) {
    for (const fn of f.fns) {
      let arr = fnsByName.get(fn.name);
      if (!arr) fnsByName.set(fn.name, arr = []);
      arr.push(fn);
    }
  }
  const byPath = new Map(files.map(f => [f.path, f]));

  const callsByFn = new Map();
  const callersByFn = new Map();
  const callEdges = [];
  const fanIn = new Map();
  const fanOut = new Map();

  for (const f of files) {
    const importTargets = new Set();
    for (const spec of (f.localImports || [])) {
      const t = resolveLocalImport(f.path, spec, byPath);
      if (t) importTargets.add(t);
    }
    for (const fn of f.fns) {
      const fromKey = fnKey(fn);
      const edges = [];
      for (const callName of (fn.calls || [])) {
        const all = fnsByName.get(callName) || [];
        const sameFile = all.filter(c => c.file === f.path);
        const imported = all.filter(c => importTargets.has(c.file));
        let target = null, confidence = 'low', candidates = [];
        if (sameFile.length >= 1) {
          target = sameFile.slice().sort((a, b) => a.lineNum - b.lineNum)[0];
          confidence = 'high';
          if (sameFile.length > 1) candidates = sameFile.map(fnKey);
        } else if (imported.length >= 1) {
          target = imported.slice().sort((a, b) => a.lineNum - b.lineNum)[0];
          confidence = 'med';
          if (imported.length > 1) candidates = imported.map(fnKey);
        } else if (all.length >= 1) {
          target = all.slice().sort((a, b) => a.file.localeCompare(b.file) || a.lineNum - b.lineNum)[0];
          confidence = 'low';
          if (all.length > 1) candidates = all.map(fnKey);
        }
        const ambiguous = candidates.length > 1;
        const resolved = !!target;
        const edge = {
          name: callName,
          target: target ? fnKey(target) : null,
          confidence,
          ambiguous,
          resolved,
          candidates,
        };
        edges.push(edge);
        if (target) {
          const toKey = fnKey(target);
          callEdges.push({ from: fromKey, to: toKey, confidence });
          fanOut.set(fromKey, (fanOut.get(fromKey) || 0) + 1);
          fanIn.set(toKey, (fanIn.get(toKey) || 0) + 1);
          let arr = callersByFn.get(toKey);
          if (!arr) callersByFn.set(toKey, arr = []);
          arr.push({ from: fromKey, confidence, ambiguous });
        }
      }
      callsByFn.set(fromKey, edges);
    }
  }
  return { callsByFn, callersByFn, callEdges, fanIn, fanOut };
}

function resolveLocalImport(importerPath, spec, byPath) {
  const dir = importerPath.includes('/') ? importerPath.slice(0, importerPath.lastIndexOf('/')) : '';
  const joined = normPath(dir ? dir + '/' + spec : spec);
  if (byPath.has(joined)) return joined;
  for (const ext of RESOLVE_EXTS) {
    const p1 = `${joined}.${ext}`;
    if (byPath.has(p1)) return p1;
  }
  for (const ext of RESOLVE_EXTS) {
    const p2 = `${joined}/index.${ext}`;
    if (byPath.has(p2)) return p2;
  }
  return null;
}

function normPath(p) {
  const parts = [];
  for (const seg of p.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
