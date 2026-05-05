// Phase 9a — Effect tagging and reverse-BFS propagation.
//
// computeEffects(state) populates:
//   STATE.effects     — Map<fnKey, {direct: Set, inherited: Set}>
//   STATE.fileEffects — Map<path,  {direct: Set, inherited: Set}>  (derived)
//
// Direct tags come from two heuristics OR'd together:
//   1. import-derived: file imports a lib in EFFECT_LIBS[tag][family] AND fn
//      body references one of that import's local bindings.
//   2. call-pattern : EFFECT_PATTERNS[tag] matches fn body slice (after
//      string + comment stripping).
//
// Inherited tags propagate via reverse-BFS over STATE.callersByFn from each
// directly-tagged seed, sorted to keep output deterministic.

import { EFFECT_TAGS, EFFECT_LIBS, EFFECT_PATTERNS, langFamily } from './effects-config.js';
import { fnKey } from './trace-graph.js';

export function computeEffects(state) {
  const effects = tagFns(state);
  propagate(state, effects);
  state.effects = effects;
  state.fileEffects = deriveFileEffects(state, effects);
  return effects;
}

// --- direct tagging ---------------------------------------------------------

function tagFns(state) {
  const out = new Map();
  for (const fn of state.allFns) {
    out.set(fnKey(fn), { direct: new Set(), inherited: new Set() });
  }
  for (const file of state.files) {
    const family = langFamily(file.ext);
    if (!family) continue;
    const bindingsByLib = extractImportBindings(file, family);
    const libToTag = libIndexFor(family);
    for (const fn of file.fns) {
      const slice = bodySlice(file, fn);
      const cleaned = stripStringsAndComments(slice, family);
      const direct = out.get(fnKey(fn)).direct;

      // 1. import-derived
      for (const [lib, bindings] of bindingsByLib) {
        const tag = libToTag.get(lib);
        if (!tag) continue;
        if (bindings.size === 0) {
          // Side-effect-only import (e.g. `import 'dotenv/config'`). Tag
          // every fn in the file — the import has no binding to narrow on.
          direct.add(tag);
          continue;
        }
        for (const b of bindings) {
          if (referencesBinding(cleaned, b)) { direct.add(tag); break; }
        }
      }

      // 2. call-pattern
      for (const tag of EFFECT_TAGS) {
        if (direct.has(tag)) continue;
        const patterns = EFFECT_PATTERNS[tag];
        if (!patterns) continue;
        for (const re of patterns) {
          if (re.test(cleaned)) { direct.add(tag); break; }
        }
      }
    }
  }
  return out;
}

function libIndexFor(family) {
  // Map<libName, tag> for a single language family.
  const m = new Map();
  for (const tag of EFFECT_TAGS) {
    const langs = EFFECT_LIBS[tag];
    if (!langs) continue;
    const libs = langs[family];
    if (!libs) continue;
    for (const lib of libs) m.set(lib, tag);
  }
  return m;
}

function referencesBinding(cleaned, name) {
  // Cheap word-boundary check.
  const re = new RegExp(`\\b${escapeRe(name)}\\b`);
  return re.test(cleaned);
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function bodySlice(file, fn) {
  // Take exactly fn.lines from the function's start. Using +1 (to grab the
  // closing brace) leaks one-line functions into the *next* function's
  // signature/body, which would mis-tag the current fn with the neighbour's
  // direct effects. Effect detection doesn't need the closing brace.
  const lines = file.src.split('\n');
  const start = Math.max(0, fn.lineNum - 1);
  const span = Math.max(fn.lines, 1);
  return lines.slice(start, start + span).join('\n');
}

// Strip strings then comments. Order matters — a comment marker inside a
// string must not eat the rest of the string, and a string delimiter inside
// a comment must not start a runaway match.
function stripStringsAndComments(text, family) {
  let s = text;
  if (family === 'js' || family === 'go' || family === 'rs' || family === 'java') {
    s = s.replace(/`(?:\\.|[^`\\])*`/g, '""')
         .replace(/'(?:\\.|[^'\\\n])*'/g, '""')
         .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
         .replace(/\/\*[\s\S]*?\*\//g, '')
         .replace(/\/\/[^\n]*/g, '');
  } else if (family === 'py') {
    s = s.replace(/"""[\s\S]*?"""/g, '""')
         .replace(/'''[\s\S]*?'''/g, "''")
         .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
         .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
         .replace(/#[^\n]*/g, '');
  } else if (family === 'rb') {
    s = s.replace(/'(?:\\.|[^'\\\n])*'/g, "''")
         .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
         .replace(/#[^\n]*/g, '');
  }
  return s;
}

// --- import binding extraction ---------------------------------------------

// Returns Map<libRoot, Set<binding>>. Empty Set means side-effect import
// (no local binding to narrow against).
function extractImportBindings(file, family) {
  const out = new Map();
  const add = (lib, name) => {
    let s = out.get(lib);
    if (!s) out.set(lib, s = new Set());
    if (name) s.add(name);
  };
  const ensure = lib => { if (!out.has(lib)) out.set(lib, new Set()); };
  const src = file.src;
  if (family === 'js') extractJsBindings(src, add, ensure);
  else if (family === 'py') extractPyBindings(src, add, ensure);
  else if (family === 'go') extractGoBindings(src, add, ensure);
  else if (family === 'rs') extractRsBindings(src, add, ensure);
  else if (family === 'rb') extractRbBindings(src, add, ensure);
  else if (family === 'java') extractJavaBindings(src, add, ensure);
  return out;
}

function libRoot(spec) { return spec.split(/[/.]/)[0]; }

function extractJsBindings(src, add, ensure) {
  // import default from 'lib'
  // import * as ns from 'lib'
  // import { a, b as c } from 'lib'
  // import default, { a } from 'lib'
  // import 'lib'
  // const x = require('lib')
  // const { a, b: c } = require('lib')
  const importRe = /import\s+(?:(\*\s*as\s+\w+|\{[^}]*\}|\w+)(?:\s*,\s*(\*\s*as\s+\w+|\{[^}]*\}|\w+))?\s+from\s+)?["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(src)) !== null) {
    const spec = m[3];
    if (spec.startsWith('.') || spec.startsWith('/')) continue;
    const lib = libRoot(spec);
    ensure(lib);
    for (const clause of [m[1], m[2]]) {
      if (!clause) continue;
      addJsClauseBindings(clause, name => add(lib, name));
    }
  }
  const reqRe = /(?:const|let|var)\s+(\{[^}]*\}|\w+)\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = reqRe.exec(src)) !== null) {
    const spec = m[2];
    if (spec.startsWith('.') || spec.startsWith('/')) continue;
    const lib = libRoot(spec);
    ensure(lib);
    addJsClauseBindings(m[1], name => add(lib, name));
  }
}

function addJsClauseBindings(clause, sink) {
  clause = clause.trim();
  if (!clause) return;
  if (clause.startsWith('*')) {
    const m = clause.match(/\*\s*as\s+(\w+)/);
    if (m) sink(m[1]);
    return;
  }
  if (clause.startsWith('{')) {
    const inner = clause.slice(1, -1);
    for (const part of inner.split(',')) {
      const p = part.trim();
      if (!p) continue;
      const asMatch = p.match(/(?:\w+)\s*(?::|as)\s*(\w+)/);
      if (asMatch) { sink(asMatch[1]); continue; }
      const nameMatch = p.match(/^(\w+)/);
      if (nameMatch) sink(nameMatch[1]);
    }
    return;
  }
  // bare identifier (default import or destructured `const x = require`)
  const m = clause.match(/^(\w+)/);
  if (m) sink(m[1]);
}

function extractPyBindings(src, add, ensure) {
  // `import lib` / `import lib as x` / `import lib.sub as x`
  const importRe = /^[ \t]*import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm;
  let m;
  while ((m = importRe.exec(src)) !== null) {
    const lib = m[1].split('.')[0];
    ensure(lib);
    add(lib, m[2] || m[1].split('.')[0]);
  }
  // `from lib import a, b as c` / `from lib import (a, b as c)`
  const fromRe = /^[ \t]*from\s+(\.*[\w.]+)\s+import\s+(?:\(([\s\S]*?)\)|([^\n#]+))/gm;
  while ((m = fromRe.exec(src)) !== null) {
    const pkg = m[1];
    if (pkg.startsWith('.')) continue;
    const lib = pkg.split('.')[0];
    ensure(lib);
    const tokens = (m[2] != null ? m[2] : m[3]).split(/[,\s]+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok === 'as' || !/^[A-Za-z_]\w*$/.test(tok)) continue;
      if (tokens[i + 1] === 'as' && /^[A-Za-z_]\w*$/.test(tokens[i + 2] || '')) {
        add(lib, tokens[i + 2]);
        i += 2;
      } else {
        add(lib, tok);
      }
    }
  }
}

function extractGoBindings(src, add, ensure) {
  const re = /import\s+(?:(\w+|\.|_)\s+)?["']([^"']+)["']/g;
  const blockRe = /import\s*\(\s*([\s\S]*?)\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const lib = libRoot(m[2]);
    ensure(lib);
    if (m[1] && /^\w+$/.test(m[1])) add(lib, m[1]);
    else add(lib, m[2].split('/').pop());
  }
  while ((m = blockRe.exec(src)) !== null) {
    const inner = m[1];
    const lineRe = /(?:(\w+|\.|_)\s+)?["']([^"']+)["']/g;
    let lm;
    while ((lm = lineRe.exec(inner)) !== null) {
      const lib = libRoot(lm[2]);
      ensure(lib);
      if (lm[1] && /^\w+$/.test(lm[1])) add(lib, lm[1]);
      else add(lib, lm[2].split('/').pop());
    }
  }
}

function extractRsBindings(src, add, ensure) {
  // `use std::fs;` `use std::fs::{File, read_to_string};` `use foo::bar as baz;`
  const re = /use\s+([\w:]+)(?:::\{([^}]*)\}|\s+as\s+(\w+))?\s*;/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const path = m[1];
    const segs = path.split('::');
    // Treat full path as the lib key (matches EFFECT_LIBS values like 'std::fs').
    const lib = path;
    ensure(lib);
    if (m[3]) add(lib, m[3]);
    else if (m[2]) {
      for (const part of m[2].split(',')) {
        const p = part.trim();
        const asMatch = p.match(/(\w+)\s+as\s+(\w+)/);
        if (asMatch) add(lib, asMatch[2]);
        else if (/^\w+$/.test(p)) add(lib, p);
      }
    } else add(lib, segs[segs.length - 1]);
  }
}

function extractRbBindings(src, add, ensure) {
  // Ruby `require` doesn't introduce a binding — globals leak from the lib.
  // Treat as side-effect import: empty binding set means "tag any fn in the
  // file for this lib's tag". This is over-tagging by design for Ruby.
  const re = /require\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    ensure(m[1]);
  }
}

function extractJavaBindings(src, add, ensure) {
  const re = /import\s+(static\s+)?([\w.]+(?:\.\*)?)\s*;/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const path = m[2];
    if (path.endsWith('.*')) {
      const lib = path.slice(0, -2);
      ensure(lib);
      // wildcard — treat as side-effect (no narrow binding)
      continue;
    }
    const last = path.lastIndexOf('.');
    const cls = last < 0 ? path : path.slice(last + 1);
    const lib = last < 0 ? path : path.slice(0, last);
    ensure(lib);
    add(lib, cls);
    // Some EFFECT_LIBS entries match the full dotted path (e.g. java.lang.Runtime)
    ensure(path);
    add(path, cls);
  }
}

// --- propagation ------------------------------------------------------------

function propagate(state, effects) {
  // Reverse-BFS from each tagged seed. Sorted seed and edge iteration keeps
  // the visited order deterministic (matters when we later attribute the
  // shortest seed path for tooltips).
  const callers = state.callersByFn || new Map();
  for (const tag of EFFECT_TAGS) {
    const seeds = [...effects.entries()]
      .filter(([, v]) => v.direct.has(tag))
      .map(([k]) => k)
      .sort();
    if (!seeds.length) continue;
    const visited = new Set();
    const queue = [...seeds];
    while (queue.length) {
      const cur = queue.shift();
      const callerEdges = callers.get(cur) || [];
      const callerKeys = [...new Set(callerEdges.map(c => c.from))].sort();
      for (const ck of callerKeys) {
        if (visited.has(ck)) continue;
        visited.add(ck);
        const e = effects.get(ck);
        if (!e) continue;
        if (e.direct.has(tag)) {
          // already a seed; don't re-mark inherited but still traverse so
          // its callers get the tag.
          queue.push(ck);
          continue;
        }
        e.inherited.add(tag);
        queue.push(ck);
      }
    }
  }
}

// --- file-level rollup ------------------------------------------------------

function deriveFileEffects(state, effects) {
  const out = new Map();
  for (const file of state.files) {
    out.set(file.path, { direct: new Set(), inherited: new Set() });
  }
  for (const fn of state.allFns) {
    const e = effects.get(fnKey(fn));
    if (!e) continue;
    const fe = out.get(fn.file);
    if (!fe) continue;
    for (const t of e.direct) fe.direct.add(t);
    for (const t of e.inherited) {
      if (!fe.direct.has(t)) fe.inherited.add(t);
    }
  }
  return out;
}
