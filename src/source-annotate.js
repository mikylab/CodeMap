// Per-line annotation map for the Source view. Every identifier-shaped token
// outside strings and comments is run through resolver.resolve(); whatever
// resolves (function, class, import, param, local, builtin) or doesn't
// (ambiguous, unresolved) becomes an annotation. Pure regex tokenization.

import { resolve } from './resolver.js';

const IDENT_RE = /\b([A-Za-z_]\w*)\b/g;

export function annotateFile(file, state) {
  const byLine = new Map();
  if (!file || !file.src) return { byLine };

  const fnAtLine = buildFnAtLine(file);
  const lines = file.src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const stripped = stripLineComment(raw, file.ext);
    if (!stripped) continue;

    const annots = [];
    IDENT_RE.lastIndex = 0;
    let m;
    while ((m = IDENT_RE.exec(stripped)) !== null) {
      const name = m[1];
      const col = m.index;
      const prev = stripped[col - 1];
      if (prev === '.' || (prev === '?' && col > 1 && stripped[col - 2] === '.')) continue;
      const enclosing = fnAtLine.get(lineNum) || null;
      const r = resolve(name, file, lineNum, enclosing, state);
      if (!r) continue;
      annots.push({ col, len: name.length, label: name, ...r });
    }
    if (annots.length) byLine.set(lineNum, annots);
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

function stripLineComment(line, ext) {
  const trimmed = line.trim();
  if (ext === 'py' || ext === 'rb') {
    if (trimmed.startsWith('#')) return null;
  } else {
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return null;
  }
  return line;
}
