import { STATE } from './state.js';
import { isStdlib, cxBucket } from './tabs.js';
import { el, clear } from './dom.js';

export function renderStatBar() {
  const root = document.getElementById('statbar');
  clear(root);
  const s = computeStats(STATE.files);
  for (const c of cells(s)) root.appendChild(c);
}

function computeStats(files) {
  let lines = 0, fns = 0, fnLines = 0;
  const libCounts = new Map();
  const langs = new Set();
  let totalCx = 0;
  for (const f of files) {
    lines += f.lineCount;
    fns += f.fns.length;
    for (const fn of f.fns) fnLines += fn.lines;
    langs.add(f.lang);
    totalCx += f.cx;
    for (const im of f.imports) libCounts.set(im.lib, (libCounts.get(im.lib) || 0) + 1);
  }
  let unused = 0;
  for (const [lib, n] of libCounts) if (n === 1 && !isStdlib(lib)) unused++;
  const avgCx = files.length ? totalCx / files.length : 0;
  const avgFnLines = fns ? fnLines / fns : 0;
  return {
    files: files.length, lines, fns, libs: libCounts.size,
    unused, avgCx, avgFnLines,
    langList: [...langs].sort().join(', ') || '—',
    langCount: langs.size,
  };
}

function cells(s) {
  return [
    cell('Lines', s.lines.toLocaleString(), `across ${s.files} files`),
    cell('Functions', String(s.fns), `avg ${s.avgFnLines.toFixed(0)} lines each`),
    cell('Libraries', String(s.libs), `${s.unused} unused`),
    cxCell(s.avgCx),
    cell('Languages', String(s.langCount), s.langList, true),
  ];
}

function cell(label, value, sub, last = false) {
  const c = el('div', { cls: 'stat-cell' + (last ? ' last' : '') });
  c.appendChild(el('div', { cls: 'stat-lbl', text: label }));
  c.appendChild(el('div', { cls: 'stat-val', text: value }));
  c.appendChild(el('div', { cls: 'stat-sub', text: sub }));
  return c;
}

function cxCell(avgCx) {
  const c = el('div', { cls: 'stat-cell' });
  c.appendChild(el('div', { cls: 'stat-lbl', text: 'Complexity' }));
  c.appendChild(el('div', { cls: `stat-val cx-${cxBucket(avgCx)}-fg`, text: avgCx.toFixed(1) }));
  c.appendChild(el('div', { cls: 'stat-sub', text: 'avg cyclomatic' }));
  return c;
}
