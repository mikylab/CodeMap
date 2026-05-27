// Per-line annotation map for the Source view. Two kinds of annotations are
// produced and merged: identifier-shaped tokens (run through resolver) and
// passive syntax tokens (strings, comments, keywords, numbers) used for
// IDE-style colouring. Both kinds share the {col, len, kind, label} shape so
// the renderer can iterate them in column order.

import { resolve } from './resolver.js';
import { classifySource } from './parser.js';

const IDENT_RE = /\b([A-Za-z_]\w*)\b/g;
const NUM_RE = /\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?\b/g;

const BUDGET_MS = 300;

const SYNTAX_KEYWORDS = {
  js: new Set('if else for while do switch case break continue return function async await new try catch finally throw class extends implements interface import export from as default const let var typeof instanceof in of delete void yield this super static get set true false null undefined'.split(' ')),
  py: new Set('if elif else for while break continue return def class import from as try except finally raise with yield lambda global nonlocal pass and or not is in del assert async await True False None'.split(' ')),
  go: new Set('if else for switch case break continue return func var const type struct interface package import go defer range select chan map true false nil'.split(' ')),
  rs: new Set('if else for while loop match break continue return fn let mut const static struct enum impl trait pub use mod as in where ref move self Self super true false'.split(' ')),
  rb: new Set('if elsif else for while until do break next return def class module require require_relative begin rescue ensure raise yield true false nil self lambda proc and or not in'.split(' ')),
  java: new Set('if else for while do switch case break continue return class interface extends implements public private protected static final abstract void int long double float boolean char byte short new this super try catch finally throw throws import package true false null instanceof'.split(' ')),
};
SYNTAX_KEYWORDS.jsx = SYNTAX_KEYWORDS.js;
SYNTAX_KEYWORDS.ts = SYNTAX_KEYWORDS.js;
SYNTAX_KEYWORDS.tsx = SYNTAX_KEYWORDS.js;
SYNTAX_KEYWORDS.mjs = SYNTAX_KEYWORDS.js;
SYNTAX_KEYWORDS.cjs = SYNTAX_KEYWORDS.js;
SYNTAX_KEYWORDS.vue = SYNTAX_KEYWORDS.js;
SYNTAX_KEYWORDS.svelte = SYNTAX_KEYWORDS.js;

export function annotateFile(file, state) {
  const byLine = new Map();
  if (!file || !file.src) return { byLine };

  const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  const fnAtLine = buildFnAtLine(file);
  // Single pass over the whole source produces both the masked code (strings
  // and comments blanked) and a per-char kinds array. String/comment colouring
  // reads kinds; identifier resolution reads `masked` so tokens inside string
  // literals or comments don't get picked up.
  const { masked, kinds } = classifySource(file.src, file.ext);
  const lines = masked.split('\n');
  const origLines = file.src.split('\n');
  const kwSet = SYNTAX_KEYWORDS[file.ext] || null;

  let lineStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (start && (performance.now() - start) > BUDGET_MS) {
      console.warn(`annotateFile budget exceeded after ${i}/${lines.length} lines on ${file.path}`);
      return { byLine, partial: true };
    }
    const lineNum = i + 1;
    const codeLine = lines[i];
    const origLine = origLines[i] || '';
    const lineLen = origLine.length;
    const annots = [];

    // String/comment ranges from the per-char kinds array.
    let k = 0;
    while (k < lineLen) {
      const kind = kinds[lineStart + k];
      if (kind === 0) { k++; continue; }
      const startCol = k;
      while (k < lineLen && kinds[lineStart + k] === kind) k++;
      annots.push({ col: startCol, len: k - startCol, kind: kind === 1 ? 'string' : 'comment', label: origLine.slice(startCol, k) });
    }

    // Identifier resolution on the masked (code-only) line.
    IDENT_RE.lastIndex = 0;
    let m;
    while ((m = IDENT_RE.exec(codeLine)) !== null) {
      const name = m[1];
      const col = m.index;
      const prev = codeLine[col - 1];
      if (prev === '.' || (prev === '?' && col > 1 && codeLine[col - 2] === '.')) continue;
      if (kwSet && kwSet.has(name)) {
        annots.push({ col, len: name.length, kind: 'keyword', label: name });
        continue;
      }
      const enclosing = fnAtLine.get(lineNum) || null;
      const r = resolve(name, file, lineNum, enclosing, state);
      if (!r) continue;
      annots.push({ col, len: name.length, label: name, ...r });
    }

    // Numbers (code-only line — masked spaces inside strings/comments mean NUM_RE won't match there).
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(codeLine)) !== null) {
      annots.push({ col: m.index, len: m[0].length, kind: 'number', label: m[0] });
    }

    if (annots.length) {
      annots.sort((a, b) => a.col - b.col || b.len - a.len);
      // Drop overlapping annots (e.g., a keyword inside a string range — shouldn't
      // happen given masking, but guard anyway). First wins by sort order.
      const merged = [];
      let cursor = 0;
      for (const a of annots) {
        if (a.col < cursor) continue;
        merged.push(a);
        cursor = a.col + a.len;
      }
      byLine.set(lineNum, merged);
    }

    lineStart += lineLen + 1; // +1 for the newline
  }
  return { byLine };
}

function buildFnAtLine(file) {
  const m = new Map();
  for (const fn of (file.fns || [])) {
    const start = fn.lineNum;
    const end = start + (fn.lines || 0);
    for (let i = start; i <= end; i++) m.set(i, fn);
  }
  return m;
}
