import { STATE, setFunctionsSort, selectPath, setTraceRoot, setActiveTab, toggleFnExpanded, hasGitStats } from '../state.js';
import { cxBucket } from '../tabs.js';
import { fnKey } from '../trace-graph.js';
import { el, basename } from '../dom.js';
import { computeRisk } from '../risk.js';

const SORTS = [
  { id: 'name', label: 'Name' },
  { id: 'lines', label: 'Lines ↓' },
  { id: 'cx', label: 'Complexity ↓' },
  { id: 'risk', label: 'Risk ↓', requiresGit: true },
];

export function renderFunctions(onChange) {
  if (!STATE.files.length) return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-title', text: 'No functions yet' }),
    el('div', { cls: 'splash-sub', text: 'Drop a folder to extract functions from your codebase.' }),
  ]);
  const wrap = el('div', { cls: 'fn-root' });
  const allFns = collectFns();
  wrap.appendChild(toolbar(allFns.length, onChange));
  wrap.appendChild(rowList(allFns, onChange));
  return wrap;
}

function collectFns() {
  const filtered = STATE.selectedPath
    ? STATE.files.filter(f => f.path === STATE.selectedPath)
    : STATE.files;
  const out = [];
  for (const f of filtered) for (const fn of f.fns) out.push({ ...fn, _file: f });
  return sortFns(out, STATE.functionsSort);
}

function sortFns(fns, mode) {
  if (mode === 'risk' && hasGitStats()) {
    const riskCache = new Map();
    const riskOf = fn => {
      const path = fn._file.path;
      if (!riskCache.has(path)) {
        riskCache.set(path, computeRisk(fn._file, STATE.gitStatsByPath[path] || { commits: 0, lastTouched: 0 }));
      }
      return riskCache.get(path) * 1000 + fn.cx;
    };
    return [...fns].sort((a, b) => riskOf(b) - riskOf(a));
  }
  const cmp =
    mode === 'name' ? (a, b) => a.name.localeCompare(b.name) :
    mode === 'lines' ? (a, b) => b.lines - a.lines :
    /* cx */ (a, b) => b.cx - a.cx;
  return [...fns].sort(cmp);
}

function toolbar(count, onChange) {
  const wrap = el('div', { cls: 'fn-toolbar' });
  wrap.appendChild(el('span', { cls: 'fn-tb-label', text: 'Sort' }));
  const sel = el('select', {
    on: { change: e => { setFunctionsSort(e.target.value); onChange(); } },
  });
  const gitOk = hasGitStats();
  for (const s of SORTS) {
    if (s.requiresGit && !gitOk) continue;
    const opt = el('option', { value: s.id, text: s.label });
    if (s.id === STATE.functionsSort) opt.selected = true;
    sel.appendChild(opt);
  }
  wrap.appendChild(sel);
  wrap.appendChild(el('div', { cls: 'tb-spacer' }));
  const label = STATE.selectedPath
    ? `${count} functions in ${basename(STATE.selectedPath)}`
    : `${count} functions`;
  wrap.appendChild(el('span', { cls: 'fn-tb-count', text: label }));
  return wrap;
}

function rowList(fns, onChange) {
  const list = el('div', { cls: 'fn-list' });
  if (!fns.length) {
    list.appendChild(el('div', { cls: 'sb-empty', text: 'no functions' }));
    return list;
  }
  for (const fn of fns) {
    const key = fnKey(fn);
    const expanded = STATE.expandedFns.has(key);
    list.appendChild(row(fn, key, expanded, onChange));
    if (expanded) list.appendChild(sourceBlock(fn));
  }
  return list;
}

function row(fn, key, expanded, onChange) {
  const r = el('div', {
    cls: 'fn-row' + (expanded ? ' expanded' : ''),
    on: {
      click: () => {
        toggleFnExpanded(key);
        selectPath(fn._file.path);
        onChange();
      },
    },
  });
  r.appendChild(el('span', { cls: 'sb-twirl', text: expanded ? '▾' : '▸' }));
  r.appendChild(el('span', { cls: 'fn-name', text: fn.name }));
  r.appendChild(el('span', { cls: 'fn-file', text: fn._file.name, title: fn._file.path }));
  r.appendChild(el('span', { cls: 'fn-lines', text: `${fn.lines}L` }));
  r.appendChild(el('span', { cls: `cx-badge cx-${cxBucket(fn.cx)}`, text: String(fn.cx) }));
  const churn = churnIndicator(fn);
  if (churn) r.appendChild(churn);
  r.appendChild(el('button', {
    cls: 'fn-trace-btn', type: 'button', text: 'trace →',
    title: 'Trace this function in the call graph',
    on: {
      click: e => {
        e.stopPropagation();
        selectPath(fn._file.path);
        setTraceRoot({ name: fn.name, file: fn._file.path, lineNum: fn.lineNum });
        setActiveTab('trace');
        onChange();
      },
    },
  }));
  return r;
}

function churnIndicator(fn) {
  if (!hasGitStats()) return null;
  const stats = STATE.gitStatsByPath[fn._file.path];
  if (!stats) return null;
  const max = maxFileCommits();
  const pct = max ? Math.min(100, (stats.commits / max) * 100) : 0;
  const fill = el('div', { cls: 'fn-churn-fill', style: { width: pct.toFixed(0) + '%' } });
  return el('div', {
    cls: 'fn-churn',
    title: `${stats.commits} commits to ${fn._file.name} (file-level — fn-level attribution requires an AST)`,
  }, [fill]);
}

let _maxCommitsCache = null;
let _maxCommitsCacheKey = null;
function maxFileCommits() {
  if (_maxCommitsCacheKey === STATE.gitLogIngestedAt && _maxCommitsCache != null) return _maxCommitsCache;
  let m = 0;
  for (const k in STATE.gitStatsByPath) {
    const c = STATE.gitStatsByPath[k].commits;
    if (c > m) m = c;
  }
  _maxCommitsCache = m;
  _maxCommitsCacheKey = STATE.gitLogIngestedAt;
  return m;
}

function sourceBlock(fn) {
  const wrap = el('div', { cls: 'fn-source' });
  const lines = extractFnSource(fn);
  if (!lines.length) {
    wrap.appendChild(el('div', { cls: 'fn-source-empty', text: 'source unavailable' }));
    return wrap;
  }
  const pre = el('pre', { cls: 'fn-source-pre' });
  const startLine = fn.lineNum;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = startLine + i;
    const row = el('div', { cls: 'fn-source-line' });
    row.appendChild(el('span', { cls: 'fn-source-num', text: String(lineNo) }));
    row.appendChild(el('span', { cls: 'fn-source-code', text: lines[i] }));
    pre.appendChild(row);
  }
  wrap.appendChild(pre);
  return wrap;
}

function extractFnSource(fn) {
  const file = fn._file;
  if (!file || !file.src) return [];
  const all = file.src.split('\n');
  const start = Math.max(0, fn.lineNum - 1);
  const end = Math.min(all.length, start + (fn.lines || 1) + 1);
  return all.slice(start, end);
}
