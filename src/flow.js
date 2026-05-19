// Flow ledger for one function: declared params, read/write effects, and the
// literal argument expressions every caller passes in (plus what each caller
// binds the return value to). Pure regex over the source we already have.

import { splitArgs } from './parser-helpers.js';

export function buildFlow(fn, state) {
  if (!fn) return null;
  const file = state.byPath.get(fn.file);
  if (!file) return null;
  const fnKey = `${fn.file}::${fn.name}`;
  const effEntry = state.effects.get(fnKey);

  return {
    fn,
    doc: fn.doc || null,
    params: fn.params || [],
    reads:  effDirection(effEntry, 'read'),
    writes: effDirection(effEntry, 'write'),
    returns: extractReturns(file.src, fn),
    callerArgs: extractCallerArgs(fnKey, fn.name, state),
    callerBindings: extractCallerBindings(fnKey, fn.name, state),
  };
}

function effDirection(entry, dir) {
  if (!entry) return { direct: new Set(), inherited: new Set() };
  if (entry.directions && entry.directions[dir]) return entry.directions[dir];
  return { direct: entry.direct || new Set(), inherited: entry.inherited || new Set() };
}

function extractReturns(src, fn) {
  const lines = src.split('\n');
  const start = fn.lineNum - 1;
  const end = Math.min(lines.length, start + (fn.lines || 1) + 1);
  const out = [];
  for (let i = start; i < end; i++) {
    const m = /^\s*(?:return|yield)\s+(.+?)\s*;?\s*$/.exec(lines[i]);
    if (!m) continue;
    out.push({ line: i + 1, expr: m[1] });
  }
  return out;
}

function extractCallerArgs(fnKey, fnName, state) {
  const callers = state.callersByFn.get(fnKey) || [];
  const out = [];
  for (const c of callers) {
    const callerFn = state.fnByKey.get(c.from);
    if (!callerFn) continue;
    const callerFile = state.byPath.get(callerFn.file);
    if (!callerFile) continue;
    const site = locateCallSite(callerFile.src, callerFn, fnName);
    if (!site) {
      out.push({ fromKey: c.from, fromFile: callerFn.file, fromLine: callerFn.lineNum, args: [] });
      continue;
    }
    out.push({
      fromKey: c.from, fromFile: callerFn.file, fromLine: site.line,
      args: splitArgs(site.argsRaw).map(s => s.trim()),
    });
  }
  return out;
}

function extractCallerBindings(fnKey, fnName, state) {
  const callers = state.callersByFn.get(fnKey) || [];
  const out = [];
  for (const c of callers) {
    const callerFn = state.fnByKey.get(c.from);
    if (!callerFn) continue;
    const callerFile = state.byPath.get(callerFn.file);
    if (!callerFile) continue;
    const site = locateCallSite(callerFile.src, callerFn, fnName);
    if (!site) {
      out.push({ fromKey: c.from, fromFile: callerFn.file, fromLine: callerFn.lineNum, binding: 'discarded', text: '' });
      continue;
    }
    const binding = classifyBinding(site.preceding);
    const text = bindingText(binding, site.preceding);
    out.push({ fromKey: c.from, fromFile: callerFn.file, fromLine: site.line, binding, text });
  }
  return out;
}

function locateCallSite(src, callerFn, calleeName) {
  const lines = src.split('\n');
  const start = callerFn.lineNum - 1;
  const end = Math.min(lines.length, start + (callerFn.lines || 1) + 1);
  const re = new RegExp(`\\b${escapeRe(calleeName)}\\s*\\(`, 'g');
  for (let i = start; i < end; i++) {
    re.lastIndex = 0;
    const m = re.exec(lines[i]);
    if (!m) continue;
    const callOpenCol = m.index + m[0].length - 1;
    const argsRaw = walkParens(lines, i, callOpenCol);
    if (argsRaw == null) continue;
    return {
      line: i + 1,
      argsRaw,
      preceding: lines[i].slice(0, m.index),
    };
  }
  return null;
}

function walkParens(lines, openLine, openCol) {
  let depth = 0;
  let buf = '';
  let started = false;
  for (let j = openLine; j < Math.min(lines.length, openLine + 30); j++) {
    const line = lines[j];
    const startCol = j === openLine ? openCol : 0;
    for (let k = startCol; k < line.length; k++) {
      const ch = line[k];
      if (ch === '(' || ch === '[' || ch === '{') {
        if (!started) { started = true; depth = 1; continue; }
        depth++;
        buf += ch;
        continue;
      }
      if (ch === ')' || ch === ']' || ch === '}') {
        depth--;
        if (depth === 0) return buf;
        buf += ch;
        continue;
      }
      if (started) buf += ch;
    }
    if (started) buf += '\n';
  }
  return null;
}

function classifyBinding(preceding) {
  const trimmed = preceding.replace(/\s+$/, '');
  if (/=\s*$/.test(trimmed) && !/[=!<>]=\s*$/.test(trimmed)) return 'lhs';
  if (/\breturn\s*$/.test(trimmed)) return 'return';
  if (/\(\s*$/.test(trimmed) || /,\s*$/.test(trimmed)) return 'arg';
  return 'discarded';
}

function bindingText(binding, preceding) {
  const trimmed = preceding.trimEnd();
  if (binding === 'lhs') {
    const m = /([\w.\[\]]+)\s*=\s*$/.exec(trimmed);
    return m ? m[1] : '';
  }
  if (binding === 'return') return 'return';
  return '';
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
