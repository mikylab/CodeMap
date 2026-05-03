import { mark, measure } from './perf.js';

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

  measure('analyze', t0, `files=${files.length} libs=${libToPaths.size} edges=${unique.length}`);
  return { edges: unique, degree, libToPaths };
}
