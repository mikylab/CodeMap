import { LANG_CONFIG } from './lang-config.js';

const KEYWORDS = new Set('if for while switch return class import export const let var def function async await new try catch finally else do break continue in of'.split(' '));
const CALL_EXCLUDE = new Set([
  ...KEYWORDS,
  ...'typeof instanceof sizeof match throw yield super self this print puts println printf lambda fn struct enum impl mod use defer go synchronized assert raise pass and or not is del global nonlocal with as from except elif'.split(' '),
]);
const CALL_RE = /\b([A-Za-z_]\w*)\s*\(/g;
const SKIP_DIRS = new Set('node_modules .git dist build .next __pycache__ .venv venv env coverage .cache'.split(' '));
const SKIP_EXTS = new Set('png jpg jpeg gif svg ico woff woff2 ttf eot lock map zip tar gz'.split(' '));

const extOf = name => (name.split('.').pop() || '').toLowerCase();

export function shouldSkipPath(path) {
  const parts = path.split(/[\\/]/);
  if (parts.some(p => SKIP_DIRS.has(p))) return true;
  const last = parts.at(-1) || '';
  if (SKIP_EXTS.has(extOf(last))) return true;
  if (last.endsWith('.min.js') || last.endsWith('.min.css')) return true;
  return false;
}

export function parseFile(name, src, path) {
  const cfg = LANG_CONFIG[extOf(name)];
  if (!cfg) return null;

  const newlines = newlineIndices(src);
  const ext = extOf(name);
  const fns = extractFns(src, cfg, path, newlines, ext);
  const imports = extractImports(src, cfg, path);
  const localImports = extractLocalImports(src, cfg, ext);
  const cx = clamp((1 + decisionCount(src)) / Math.max(fns.length, 1), 1, 30);

  return {
    name, path, ext,
    lang: cfg.name, langColor: cfg.color,
    lineCount: newlines.length + 1,
    fns, imports, localImports, cx,
    src,
  };
}

function forEachMatch(src, regexes, cb) {
  const seen = new Set();
  for (const re of regexes) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const cap = m[1] || m[2] || m[3];
      if (!cap) continue;
      const key = cap + '@' + m.index;
      if (seen.has(key)) continue;
      seen.add(key);
      cb(cap, m.index);
    }
  }
}

function extractFns(src, cfg, path, newlines, ext) {
  const out = [];
  // Match fn/class regexes against a copy with string + comment contents blanked
  // (length-preserving, newlines kept) so docstring prose can't yield phantom
  // definitions — e.g. `class\s+(\w+)` reaching across a blank line into a
  // module docstring ("...Experiment class\n\nOne Experiment = ...") and
  // capturing "One". Bodies are still sliced from the real source.
  const masked = maskLiterals(src, ext);
  forEachMatch(masked, cfg.fn, (name, idx) => {
    if (name.length < 2 || KEYWORDS.has(name)) return;
    const body = bodyAt(src, idx);
    const callText = stripNoise(body.text, ext);
    const params = extractParams(src, idx);
    out.push({
      name, file: path,
      lineNum: lineFor(newlines, idx),
      lines: body.lines,
      cx: clamp(decisionCount(body.text) || 1, 1, 30),
      calls: extractCalls(callText, name, params),
    });
  });
  return out;
}

// Pull identifier names from the signature's parameter list(s) so that
// framework-injected params (Starlette's `call_next`, Express's `next`, etc.)
// aren't reported as unresolved calls when invoked inside the body. We scan up
// to two paren groups after `idx` so Go's `func (recv) Name(args)` form picks
// up both the receiver and the real params.
function extractParams(src, idx) {
  const out = [];
  let cursor = idx;
  for (let pass = 0; pass < 2; pass++) {
    const open = src.indexOf('(', cursor);
    if (open < 0 || open - cursor > 300) break;
    let depth = 0, end = -1;
    for (let i = open; i < src.length && i - open < 4000; i++) {
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) break;
    const inner = src.slice(open + 1, end);
    let buf = '', d = 0;
    const flush = () => {
      let p = buf.trim().replace(/^(\*+|\.{3})/, '').trim();
      buf = '';
      if (!p) return;
      if (p.startsWith('{') || p.startsWith('[')) {
        const ids = p.match(/[A-Za-z_]\w*/g) || [];
        for (const id of ids) out.push(id);
        return;
      }
      const m = p.match(/^([A-Za-z_]\w*)/);
      if (m) out.push(m[1]);
    };
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') d--;
      else if (c === ',' && d === 0) { flush(); continue; }
      buf += c;
    }
    flush();
    cursor = end + 1;
  }
  return out;
}

// Strip strings/comments before call extraction so words inside docstrings
// (e.g., `"...start (Monday) and end (Sunday)..."`) don't get matched by the
// `name(` regex and surface as unresolved-call false positives.
function stripNoise(text, ext) {
  if (ext === 'py') {
    return text
      // Closed triple-quoted strings (docstrings + multi-line literals).
      .replace(/("""|''')[\s\S]*?\1/g, '')
      // Unclosed triple-quote: `bodyAt` stops at the first blank line, which
      // can land inside a multi-line docstring. Strip from the opening delim
      // to end of the slice so the docstring's prose can't leak into the
      // call extractor.
      .replace(/("""|''')[\s\S]*$/g, '')
      // Single- and double-quoted strings (single line). Words inside
      // `print("TEST: topic detection (no LLM)")` were matching as calls.
      .replace(/"(?:\\[\s\S]|[^"\\\n])*"/g, '""')
      .replace(/'(?:\\[\s\S]|[^'\\\n])*'/g, "''")
      .replace(/(^|[^\\])#[^\n]*/g, '$1');
  }
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs' || ext === 'ts' || ext === 'tsx' || ext === 'jsx') {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
      .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``');
  }
  return text;
}

// Length-preserving mask of string literals and comments: their contents become
// spaces, but the text length and every newline are preserved so byte offsets
// and line numbers still line up with the original source. Used before
// structural (fn/class) regex matching so prose inside docstrings, comments, and
// string literals can't be mistaken for code.
function maskLiterals(src, ext) {
  const py = ext === 'py';
  const jsFam = ext === 'js' || ext === 'mjs' || ext === 'cjs' ||
                ext === 'ts' || ext === 'tsx' || ext === 'jsx' ||
                ext === 'vue' || ext === 'svelte';
  if (!py && !jsFam) return src;
  const out = src.split('');
  const n = src.length;
  const blank = (a, b) => { for (let i = a; i < b && i < n; i++) if (out[i] !== '\n') out[i] = ' '; };
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (py && c === '#') { let j = i; while (j < n && src[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (jsFam && c === '/' && src[i + 1] === '/') { let j = i; while (j < n && src[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (jsFam && c === '/' && src[i + 1] === '*') {
      let j = i + 2; while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(j + 2, n); blank(i, j); i = j; continue;
    }
    if (py && (c === '"' || c === "'") && src[i + 1] === c && src[i + 2] === c) {
      const q = c; let j = i + 3;
      while (j < n && !(src[j] === q && src[j + 1] === q && src[j + 2] === q)) j++;
      j = Math.min(j + 3, n); blank(i, j); i = j; continue;
    }
    if (c === '"' || c === "'" || (jsFam && c === '`')) {
      const q = c; let j = i + 1;
      while (j < n && src[j] !== q) {
        if (src[j] === '\\') j += 2;
        else if (src[j] === '\n' && q !== '`') break;
        else j++;
      }
      const closed = src[j] === q;
      blank(i, closed ? j + 1 : j);
      i = closed ? j + 1 : j;
      continue;
    }
    i++;
  }
  return out.join('');
}

function extractCalls(bodyText, ownName, params) {
  const out = new Set();
  const paramSet = params && params.length ? new Set(params) : null;
  CALL_RE.lastIndex = 0;
  let m;
  while ((m = CALL_RE.exec(bodyText)) !== null) {
    const name = m[1];
    if (name.length < 2) continue;
    if (name === ownName) continue;
    if (CALL_EXCLUDE.has(name)) continue;
    if (paramSet && paramSet.has(name)) continue;
    // Skip method calls (`obj.foo(`, `obj?.foo(`). We can't resolve the
    // receiver's type from regex, so flagging these as unresolved is a false
    // positive. Free-function calls remain in scope.
    const prev = bodyText[m.index - 1];
    if (prev === '.' || (prev === '?' && bodyText[m.index - 2] === '.')) continue;
    out.add(name);
  }
  return [...out].sort();
}

function extractImports(src, cfg, path) {
  const out = []; const seen = new Set();
  forEachMatch(src, cfg.imports, raw => {
    raw = raw.trim();
    if (raw.startsWith('.') || raw.startsWith('/')) return;
    if (/^https?:\/\//i.test(raw) || raw.startsWith('//')) return;
    const lib = raw.split(/[/.]/)[0];
    if (!lib || seen.has(lib)) return;
    seen.add(lib);
    out.push({ from: path, lib });
  });
  return out;
}

function extractLocalImports(src, cfg, ext) {
  // Path-style languages (cfg.localStyle === 'path') only treat specs starting
  // with `.` or `/` as local. Dotted-namespace languages (Python, Java) can
  // have bare-name local specs — keep those.
  const pathStyle = cfg.localStyle === 'path';
  const out = []; const seen = new Set();
  const add = raw => {
    if (!raw) return;
    if (/^https?:\/\//i.test(raw) || raw.startsWith('//')) return;
    if (seen.has(raw)) return;
    seen.add(raw);
    out.push(raw);
  };
  forEachMatch(src, cfg.imports, raw => {
    raw = raw.trim();
    if (!raw) return;
    if (pathStyle && !(raw.startsWith('.') || raw.startsWith('/'))) return;
    add(raw);
  });

  // Python `from pkg import a, b` — `pkg` alone won't resolve when pkg is a
  // directory of modules. Emit `pkg.a`, `pkg.b` so the dotted resolver can
  // find pkg/a.py, pkg/b.py. Handles single-line and parenthesized multi-line
  // forms.
  if (ext === 'py') {
    const fromRe = /^[ \t]*from\s+(\.*[\w.]*)\s+import\s+(?:\(([\s\S]*?)\)|([^\n#]+))/gm;
    let m;
    while ((m = fromRe.exec(src)) !== null) {
      const pkg = m[1];
      if (!pkg || pkg.startsWith('.')) continue;
      const tokens = (m[2] != null ? m[2] : m[3]).split(/[,\s]+/).filter(Boolean);
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (!/^[A-Za-z_]\w*$/.test(tok) || tok === 'as') continue;
        if (tokens[i + 1] === 'as') i += 2;
        add(`${pkg}.${tok}`);
      }
    }
  }
  return out;
}

function newlineIndices(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) out.push(i);
  return out;
}

function lineFor(newlines, pos) {
  let lo = 0, hi = newlines.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (newlines[m] < pos) lo = m + 1; else hi = m;
  }
  return lo + 1;
}

function bodyAt(src, idx) {
  const after = src.slice(idx).split('\n');
  let n = 0;
  for (let i = 1; i < after.length && i < 60; i++) {
    if (after[i].trim() === '' && n > 0) break;
    n++;
  }
  return { lines: n, text: after.slice(0, n + 1).join('\n') };
}

function decisionCount(s) {
  const re = /\b(?:if|else|for|while|case|catch|switch)\b|&&|\|\||\?/g;
  let n = 0;
  while (re.exec(s) !== null) n++;
  return n;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
