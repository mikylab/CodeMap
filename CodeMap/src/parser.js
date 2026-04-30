import { LANG_CONFIG } from './lang-config.js';

const KEYWORDS = new Set('if for while switch return class import export const let var def function async await new try catch finally else do break continue in of'.split(' '));
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
  const fns = extractFns(src, cfg, path, newlines);
  const imports = extractImports(src, cfg, path);
  const cx = clamp((1 + decisionCount(src)) / Math.max(fns.length, 1), 1, 30);

  return {
    name, path, ext: extOf(name),
    lang: cfg.name, langColor: cfg.color,
    lineCount: newlines.length + 1,
    fns, imports, cx,
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

function extractFns(src, cfg, path, newlines) {
  const out = [];
  forEachMatch(src, cfg.fn, (name, idx) => {
    if (name.length < 2 || KEYWORDS.has(name)) return;
    const body = bodyAt(src, idx);
    out.push({
      name, file: path,
      lineNum: lineFor(newlines, idx),
      lines: body.lines,
      cx: clamp(decisionCount(body.text) || 1, 1, 30),
    });
  });
  return out;
}

function extractImports(src, cfg, path) {
  const out = []; const seen = new Set();
  forEachMatch(src, cfg.imports, raw => {
    raw = raw.trim();
    if (raw.startsWith('.') || raw.startsWith('/')) return;
    const lib = raw.split(/[/.]/)[0];
    if (!lib || seen.has(lib)) return;
    seen.add(lib);
    out.push({ from: path, lib });
  });
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
