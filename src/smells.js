// Phase 9b — Smell detectors. Pure functions over STATE (after analyze).
//
// detectSmells(state) -> SmellFinding[]   sorted (warn first, then file/line)
//
// A SmellFinding {
//   id, kind, subkind, severity, file, line, fnName, snippet, why
// }
//
// Detectors (all language-agnostic regex-based — no AST):
//   1. unresolved-call    — call site whose name is not in builtins/imports/local defs
//   2. broken-import      — relative import that resolves to no file
//   3. suspicious-comment — TODO/FIXME/HACK/etc inside a comment
//   4. empty-catch        — swallowed catch blocks (JS/TS, Python, Go)
//   5. placeholder        — magic strings (localhost, YOUR_API_KEY, …) and ports

import { langFamily, BUILTINS } from './effects-config.js';

export function detectSmells(state) {
  const out = [];
  const byPath = state.byPath || new Map(state.files.map(f => [f.path, f]));
  const importBindingsByFile = buildImportBindingIndex(state);
  const sameFileNames = buildSameFileNameIndex(state);

  for (const file of state.files) {
    const family = langFamily(file.ext);
    const stripped = stripStringsAndComments(file.src, family);
    detectUnresolvedCalls(file, family, importBindingsByFile, sameFileNames, out);
    detectBrokenImports(file, byPath, out);
    detectSuspiciousComments(file, family, out);
    detectEmptyCatches(file, family, out);
    detectPlaceholders(file, stripped, out);
  }

  out.sort(compareFindings);
  return out;
}

function compareFindings(a, b) {
  const sa = a.severity === 'warn' ? 0 : 1;
  const sb = b.severity === 'warn' ? 0 : 1;
  if (sa !== sb) return sa - sb;
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  if (a.line !== b.line) return a.line - b.line;
  return a.kind.localeCompare(b.kind);
}

export function indexSmellsByFile(findings) {
  const m = new Map();
  for (const f of findings) {
    let arr = m.get(f.file);
    if (!arr) m.set(f.file, arr = []);
    arr.push(f);
  }
  return m;
}

// --- shared helpers ---------------------------------------------------------

function lineFor(src, idx) {
  let n = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

function snippetAt(src, idx, max = 80) {
  const start = src.lastIndexOf('\n', idx - 1) + 1;
  let end = src.indexOf('\n', idx);
  if (end < 0) end = src.length;
  let s = src.slice(start, end).trim();
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return s;
}

function makeId(file, line, kind, snippet) {
  // Cheap stable hash — content-derived so re-parses produce the same id.
  const s = `${file}|${line}|${kind}|${snippet}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return `sm_${h.toString(36)}`;
}

function fnAtLine(file, line) {
  let best = null;
  for (const fn of file.fns) {
    if (fn.lineNum <= line && (!best || fn.lineNum > best.lineNum)) {
      if (line <= fn.lineNum + (fn.lines || 0) + 1) best = fn;
    }
  }
  return best ? best.name : null;
}

function stripStringsAndComments(text, family) {
  let s = text;
  if (!family) return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
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

// --- imports / names indexes ------------------------------------------------

function buildImportBindingIndex(state) {
  // Map<filePath, Set<bindingName>> — names that are legitimate references
  // because they came in via `import` / `require` / `from x import y`.
  const out = new Map();
  for (const file of state.files) {
    const set = new Set();
    const family = langFamily(file.ext);
    if (family === 'js') collectJsBindings(file.src, set);
    else if (family === 'py') collectPyBindings(file.src, set);
    else if (family === 'go') collectGoBindings(file.src, set);
    out.set(file.path, set);
  }
  return out;
}

function collectJsBindings(src, set) {
  const importRe = /import\s+(?:(\*\s*as\s+\w+|\{[^}]*\}|\w+)(?:\s*,\s*(\*\s*as\s+\w+|\{[^}]*\}|\w+))?\s+from\s+)?["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(src)) !== null) {
    for (const c of [m[1], m[2]]) addJsClause(c, set);
  }
  const reqRe = /(?:const|let|var)\s+(\{[^}]*\}|\w+)\s*=\s*require\s*\(/g;
  while ((m = reqRe.exec(src)) !== null) addJsClause(m[1], set);
  // local declarations (function/const/let/var/class) — treat their names as bound
  const declRe = /(?:function\s+(\w+)|class\s+(\w+)|(?:const|let|var)\s+(\w+))/g;
  while ((m = declRe.exec(src)) !== null) {
    const n = m[1] || m[2] || m[3];
    if (n) set.add(n);
  }
  // Module-level bare assignments (e.g. `_name = other_name`). Any assignment
  // at column 0 creates a real binding, including conditional/guarded paths.
  const assignRe = /^([A-Za-z_]\w*)\s*=(?!=)/gm;
  while ((m = assignRe.exec(src)) !== null) set.add(m[1]);
}

function addJsClause(clause, set) {
  if (!clause) return;
  clause = clause.trim();
  if (clause.startsWith('*')) {
    const m = clause.match(/\*\s*as\s+(\w+)/);
    if (m) set.add(m[1]);
    return;
  }
  if (clause.startsWith('{')) {
    const inner = clause.slice(1, -1);
    for (const part of inner.split(',')) {
      const p = part.trim();
      const asMatch = p.match(/(?:\w+)\s*(?::|as)\s*(\w+)/);
      if (asMatch) { set.add(asMatch[1]); continue; }
      const nameMatch = p.match(/^(\w+)/);
      if (nameMatch) set.add(nameMatch[1]);
    }
    return;
  }
  const m = clause.match(/^(\w+)/);
  if (m) set.add(m[1]);
}

function collectPyBindings(src, set) {
  const importRe = /^[ \t]*import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm;
  let m;
  while ((m = importRe.exec(src)) !== null) set.add(m[2] || m[1].split('.')[0]);
  const fromRe = /^[ \t]*from\s+(\.*[\w.]+)\s+import\s+(?:\(([\s\S]*?)\)|([^\n#]+))/gm;
  while ((m = fromRe.exec(src)) !== null) {
    const tokens = (m[2] != null ? m[2] : m[3]).split(/[,\s]+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok === 'as' || !/^[A-Za-z_]\w*$/.test(tok)) continue;
      if (tokens[i + 1] === 'as' && /^[A-Za-z_]\w*$/.test(tokens[i + 2] || '')) {
        set.add(tokens[i + 2]); i += 2;
      } else {
        set.add(tok);
      }
    }
  }
  const defRe = /(?:^|\n)[ \t]*(?:def|class)\s+(\w+)/g;
  while ((m = defRe.exec(src)) !== null) set.add(m[1]);
  // Module-level assignments: any `name = ...` at column 0 (no leading
  // indentation) creates a real binding, including conditional/guarded
  // reassignments. We treat "any module-scope assignment defines the name"
  // rather than "first unconditional assignment defines it".
  const assignRe = /^([A-Za-z_]\w*)\s*(?::[^=\n]+)?=(?!=)/gm;
  while ((m = assignRe.exec(src)) !== null) set.add(m[1]);
}

function collectGoBindings(src, set) {
  const re = /import\s+(?:\w+\s+)?["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) set.add(m[1].split('/').pop());
  const blockRe = /import\s*\(\s*([\s\S]*?)\)/g;
  while ((m = blockRe.exec(src)) !== null) {
    const lr = /(?:(\w+)\s+)?["']([^"']+)["']/g;
    let lm;
    while ((lm = lr.exec(m[1])) !== null) set.add(lm[1] || lm[2].split('/').pop());
  }
  const defRe = /func\s+(?:\([^)]*\)\s*)?(\w+)/g;
  while ((m = defRe.exec(src)) !== null) set.add(m[1]);
}

function buildSameFileNameIndex(state) {
  const out = new Map();
  for (const file of state.files) {
    const set = new Set(file.fns.map(fn => fn.name));
    out.set(file.path, set);
  }
  return out;
}

// --- 1. unresolved calls ---------------------------------------------------

function detectUnresolvedCalls(file, family, importBindingsByFile, sameFileNames, out) {
  const callsByFn = file._callsByFn; // not used; we re-derive per fn below
  const builtins = BUILTINS[family] || new Set();
  const imports = importBindingsByFile.get(file.path) || new Set();
  const localNames = sameFileNames.get(file.path) || new Set();
  // length-preserving: blanks out comments so indexes still map to file.src
  const searchSrc = stripCommentsOnly(file.src, family);

  // Per fn: walk declared `calls` array; flag names not in builtins/imports/local.
  for (const fn of file.fns) {
    const fnParamNames = (fn.params || [])
      .map(p => (p.name || p || '').replace(/^\**/, ''))
      .filter(Boolean);
    const fnScope = new Set([...fnParamNames, ...(fn.locals || [])]);
    for (const callName of (fn.calls || [])) {
      // Dunder methods (`__init__`, `__new__`, `__post_init__`, …) are part of
      // the Python object protocol — always provided by the runtime, never an
      // unresolved import. Skip them so bare dunder calls aren't false alarms.
      if (family === 'py' && /^__\w+__$/.test(callName)) continue;
      if (builtins.has(callName)) continue;
      if (imports.has(callName)) continue;
      if (localNames.has(callName)) continue;
      // Bindings inside the function body itself (params, plus any local
      // assignment like `handler = dispatch.get(action)`) satisfy the check —
      // a name assigned anywhere in the function's scope is defined for
      // later uses in that scope.
      if (fnScope.has(callName)) continue;
      // Locate first occurrence in the fn body (cheap heuristic for line number).
      const startIdx = lineStartIdx(file.src, fn.lineNum);
      const re = new RegExp(`\\b${callName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`, 'g');
      re.lastIndex = startIdx;
      const m = re.exec(searchSrc);
      if (!m) continue;
      const line = lineFor(file.src, m.index);
      const snippet = snippetAt(file.src, m.index);
      out.push({
        id: makeId(file.path, line, 'unresolved-call', snippet),
        kind: 'unresolved-call',
        subkind: callName,
        severity: 'warn',
        file: file.path,
        line,
        fnName: fn.name,
        snippet,
        why: `${callName}() has no definition or import in this repo`,
      });
    }
  }
}

function lineStartIdx(src, line) {
  let cur = 0;
  for (let i = 1; i < line; i++) {
    const j = src.indexOf('\n', cur);
    if (j < 0) return src.length;
    cur = j + 1;
  }
  return cur;
}

// --- 2. broken relative imports --------------------------------------------

function detectBrokenImports(file, byPath, out) {
  for (const spec of (file.localImports || [])) {
    if (!(spec.startsWith('.') || spec.startsWith('/'))) continue;
    if (resolveSpec(file.path, spec, byPath)) continue;
    const idx = file.src.indexOf(spec);
    const line = idx >= 0 ? lineFor(file.src, idx) : 1;
    const snippet = idx >= 0 ? snippetAt(file.src, idx) : spec;
    out.push({
      id: makeId(file.path, line, 'broken-import', snippet),
      kind: 'broken-import',
      subkind: 'relative',
      severity: 'warn',
      file: file.path,
      line,
      fnName: null,
      snippet,
      why: `relative import "${spec}" does not resolve to a known file`,
    });
  }
}

const RESOLVE_EXTS = ['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java'];

function resolveSpec(importerPath, spec, byPath) {
  const dir = importerPath.includes('/') ? importerPath.slice(0, importerPath.lastIndexOf('/')) : '';
  spec = normalizeRelSpec(spec);
  const joined = normPath(dir ? dir + '/' + spec : spec);
  if (byPath.has(joined)) return joined;
  for (const ext of RESOLVE_EXTS) if (byPath.has(`${joined}.${ext}`)) return `${joined}.${ext}`;
  for (const ext of RESOLVE_EXTS) if (byPath.has(`${joined}/index.${ext}`)) return `${joined}/index.${ext}`;
  if (byPath.has(`${joined}/__init__.py`)) return `${joined}/__init__.py`;
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

// Python relative imports use leading dots as level markers, not path
// segments: one dot = the importer's own package, N dots = (N-1) levels up,
// and remaining dots are submodule separators. ".core" -> "./core",
// "..pkg.mod" -> "./../pkg/mod", "." -> "./". Path-style specs (containing a
// "/", e.g. JS "./core" or "../util") are returned unchanged.
function normalizeRelSpec(spec) {
  if (spec.includes('/')) return spec;
  const m = /^(\.+)([\w.]*)$/.exec(spec);
  if (!m) return spec;
  const up = '../'.repeat(m[1].length - 1);
  return './' + up + m[2].replace(/\./g, '/');
}

// --- 3. suspicious comments -------------------------------------------------

const SUSPICIOUS_RE = /\b(TODO|FIXME|XXX|HACK|WTF|temporarily|for now|workaround|should never happen|placeholder|stub|fake|dummy|mock(?!\w))\b/i;

function detectSuspiciousComments(file, family, out) {
  const ranges = commentRanges(file.src, family);
  for (const r of ranges) {
    const text = file.src.slice(r.start, r.end);
    const m = text.match(SUSPICIOUS_RE);
    if (!m) continue;
    const idx = r.start + m.index;
    const line = lineFor(file.src, idx);
    const word = m[1];
    const snippet = snippetAt(file.src, idx);
    const sev = /^TODO|^FIXME$/i.test(word) ? 'info' : 'warn';
    out.push({
      id: makeId(file.path, line, 'suspicious-comment', snippet),
      kind: 'suspicious-comment',
      subkind: word.toUpperCase(),
      severity: sev,
      file: file.path,
      line,
      fnName: fnAtLine(file, line),
      snippet,
      why: `comment contains "${word}"`,
    });
  }
}

function commentRanges(src, family) {
  const out = [];
  if (!family) return out;
  if (family === 'js' || family === 'go' || family === 'rs' || family === 'java') {
    const re1 = /\/\/[^\n]*/g;
    const re2 = /\/\*[\s\S]*?\*\//g;
    let m;
    while ((m = re1.exec(src)) !== null) out.push({ start: m.index, end: m.index + m[0].length });
    while ((m = re2.exec(src)) !== null) out.push({ start: m.index, end: m.index + m[0].length });
  } else if (family === 'py' || family === 'rb') {
    const re = /#[^\n]*/g;
    let m;
    while ((m = re.exec(src)) !== null) out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// --- 4. empty / swallowed catches ------------------------------------------

const EMPTY_CATCH = {
  js:   /catch\s*(?:\([^)]*\))?\s*\{(\s*|\s*\/\/[^\n]*\s*|\s*return\s+(?:null|undefined)\s*;?\s*|\s*console\.(?:log|error|warn)\s*\([^)]*\)\s*;?\s*)\}/g,
  py:   /except[^\n:]*:\s*(?:pass|return\s+None)\b/g,
  go:   /if\s+err\s*!=\s*nil\s*\{\s*(?:return\s*(?:nil)?\s*|\/\/[^\n]*)\s*\}/g,
};

function detectEmptyCatches(file, family, out) {
  const re = EMPTY_CATCH[family];
  if (!re) return;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(file.src)) !== null) {
    const line = lineFor(file.src, m.index);
    const snippet = snippetAt(file.src, m.index);
    let subkind = 'empty';
    let severity = 'warn';
    let why = 'caught error is swallowed without handling';
    if (/return\s+(?:null|undefined|None)/.test(m[0])) subkind = 'return-null';
    else if (/console\.(log|error|warn)/.test(m[0])) subkind = 'log-only';
    else if (family === 'go') subkind = 'err-swallow';
    // A Python `except` that names specific exception types — not bare
    // `except:` and not the catch-alls `Exception`/`BaseException` — is a
    // deliberate, narrow handling decision, typically the EAFP fallback idiom
    // (`try int / except (ValueError, TypeError): pass / try float`). Surface
    // it for visibility, but as info rather than a warn-level false alarm.
    if (family === 'py' && isNarrowExcept(m[0])) {
      subkind = 'narrow';
      severity = 'info';
      why = 'narrowly-scoped exception caught and ignored (likely intentional fallback)';
    }
    out.push({
      id: makeId(file.path, line, 'empty-catch', snippet),
      kind: 'empty-catch',
      subkind,
      severity,
      file: file.path,
      line,
      fnName: fnAtLine(file, line),
      snippet,
      why,
    });
  }
}

// True when a Python `except` clause names specific exception types rather than
// catching broadly. Bare `except:`, `except Exception[...]`, and
// `except BaseException[...]` are broad (kept at warn). Anything else — e.g.
// `except (ValueError, TypeError):` — is narrow.
function isNarrowExcept(matchText) {
  const colon = matchText.indexOf(':');
  if (colon < 0) return false;
  const clause = matchText.slice(matchText.indexOf('except') + 6, colon)
    .trim().replace(/^\(/, '').replace(/\)$/, '').trim();
  if (!clause) return false;                          // bare `except:`
  if (/^(Exception|BaseException)\b/.test(clause)) return false; // catch-all
  return true;
}

// --- 5. magic placeholders -------------------------------------------------

const PLACEHOLDERS = [
  { kind: 'localhost',  re: /['"`](?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^'"`]*['"`]/g, sev: 'warn' },
  { kind: 'env-stub',   re: /['"`]YOUR_[A-Z_]+['"`]/g, sev: 'warn' },
  { kind: 'lorem',      re: /['"`](?:foo|bar|baz|test123|asdf|xxx)['"`]/gi, sev: 'warn' },
  { kind: 'todo-str',   re: /['"`]TODO[^'"`]*['"`]/g, sev: 'warn' },
  // Require port-like context: a `port`/`listen`/`bind` identifier followed by
  // `=`, `:`, or `(` within ~20 chars of the number. The bare-number form was
  // a false-positive magnet (`latency_ms < 5000`, `range(3000)`, timeouts in
  // ms). URL forms like `"http://localhost:5000"` are already handled by the
  // `localhost` placeholder rule above.
  { kind: 'magic-port', re: /\b(?:port|listen|bind)\b[^\n=]{0,20}[:=(]\s*(?:3000|3001|5000|8000|8080|8888|9000)\b/gi, sev: 'info' },
];

function detectPlaceholders(file, _stripped, out) {
  // Scan against raw source so quoted strings remain visible. Strip comments
  // first so a "TODO" in a comment doesn't double-fire (suspicious-comment
  // already covers it).
  const src = stripCommentsOnly(file.src, langFamily(file.ext));
  for (const { kind, re, sev } of PLACEHOLDERS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const idx = m.index;
      const line = lineFor(file.src, idx);
      const snippet = snippetAt(file.src, idx);
      out.push({
        id: makeId(file.path, line, 'placeholder', snippet + '|' + kind),
        kind: 'placeholder',
        subkind: kind,
        severity: sev,
        file: file.path,
        line,
        fnName: fnAtLine(file, line),
        snippet,
        why: `placeholder value: ${kind}`,
      });
    }
  }
}

// Length-preserving comment stripper that walks char-by-char so it doesn't
// mistake a `//` inside a string literal (e.g. "http://...") for a comment.
function stripCommentsOnly(text, family) {
  if (!family) return text;
  const cStyle = family === 'js' || family === 'go' || family === 'rs' || family === 'java';
  const hashStyle = family === 'py' || family === 'rb';
  if (!cStyle && !hashStyle) return text;
  const out = text.split('');
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    // string literal — skip past it untouched
    if (c === '"' || c === "'" || (cStyle && c === '`')) {
      const q = c;
      i++;
      while (i < n && text[i] !== q) {
        if (text[i] === '\\') i += 2;
        else if (text[i] === '\n' && q !== '`') break;
        else i++;
      }
      i++;
      continue;
    }
    if (cStyle && c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') { out[i] = ' '; i++; }
      continue;
    }
    if (cStyle && c === '/' && text[i + 1] === '*') {
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) { out[i] = ' '; i++; }
      if (i < n) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
      continue;
    }
    if (hashStyle && c === '#') {
      while (i < n && text[i] !== '\n') { out[i] = ' '; i++; }
      continue;
    }
    i++;
  }
  return out.join('');
}
