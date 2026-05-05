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
  const fileGraph = buildFileImportGraph(files);

  measure('analyze', t0, `files=${files.length} libs=${libToPaths.size} edges=${unique.length} callEdges=${callGraph.callEdges.length}`);
  return { edges: unique, degree, libToPaths, ...callGraph, ...fileGraph };
}

function buildFileImportGraph(files) {
  const byPath = new Map(files.map(f => [f.path, f]));
  const fileImports = new Map();
  const fileImporters = new Map();
  for (const f of files) {
    const targets = new Set();
    for (const spec of (f.localImports || [])) {
      const t = resolveLocalImport(f.path, spec, byPath);
      if (t && t !== f.path) targets.add(t);
    }
    fileImports.set(f.path, targets);
    for (const t of targets) {
      let s = fileImporters.get(t);
      if (!s) fileImporters.set(t, s = new Set());
      s.add(f.path);
    }
  }
  return { fileImports, fileImporters };
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
        const imported = sameFile.length ? null : all.filter(c => importTargets.has(c.file));
        let pool = null, confidence = 'low';
        if (sameFile.length) { pool = sameFile; confidence = 'high'; }
        else if (imported && imported.length) { pool = imported; confidence = 'med'; }
        else if (all.length) { pool = all; confidence = 'low'; }
        let target = null, candidates = [];
        if (pool) {
          target = pool.length === 1
            ? pool[0]
            : pool.slice().sort((a, b) => a.file.localeCompare(b.file) || a.lineNum - b.lineNum)[0];
          if (pool.length > 1) candidates = pool.map(fnKey);
        }
        const ambiguous = candidates.length > 1;
        edges.push({
          name: callName,
          target: target ? fnKey(target) : null,
          confidence,
          ambiguous,
          resolved: !!target,
          candidates,
        });
        if (target) {
          const toKey = fnKey(target);
          callEdges.push({ from: fromKey, to: toKey, confidence });
          fanOut.set(fromKey, (fanOut.get(fromKey) || 0) + 1);
          fanIn.set(toKey, (fanIn.get(toKey) || 0) + 1);
          let arr = callersByFn.get(toKey);
          if (!arr) callersByFn.set(toKey, arr = []);
          arr.push({ from: fromKey, fromFile: f.path, confidence, ambiguous });
        }
      }
      callsByFn.set(fromKey, edges);
    }
  }
  return { callsByFn, callersByFn, callEdges, fanIn, fanOut };
}

function resolveLocalImport(importerPath, spec, byPath) {
  const dir = importerPath.includes('/') ? importerPath.slice(0, importerPath.lastIndexOf('/')) : '';
  const candidates = [];
  if (spec.startsWith('.') || spec.startsWith('/')) {
    candidates.push(normPath(dir ? dir + '/' + spec : spec));
  } else {
    // Package-style dotted spec (Python "pkg.mod", Java "com.foo.Bar"). Try as
    // a path from the repo root, then from every ancestor dir of the importer
    // — covers the case where the repo was dropped under a wrapper folder, so
    // `src/formatters` actually lives at `MyRepo/src/formatters.py`.
    const dotted = spec.replace(/\./g, '/');
    candidates.push(dotted);
    let cur = dir;
    while (cur) {
      candidates.push(normPath(cur + '/' + dotted));
      const i = cur.lastIndexOf('/');
      cur = i < 0 ? '' : cur.slice(0, i);
    }
  }
  for (const joined of candidates) {
    if (!joined) continue;
    if (byPath.has(joined)) return joined;
    for (const ext of RESOLVE_EXTS) {
      const p1 = `${joined}.${ext}`;
      if (byPath.has(p1)) return p1;
    }
    for (const ext of RESOLVE_EXTS) {
      const p2 = `${joined}/index.${ext}`;
      if (byPath.has(p2)) return p2;
    }
    if (byPath.has(`${joined}/__init__.py`)) return `${joined}/__init__.py`;
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
