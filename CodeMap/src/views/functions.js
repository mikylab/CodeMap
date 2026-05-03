import { STATE, setFunctionsSort, selectPath, setTraceRoot, setActiveTab } from '../state.js';
import { cxBucket } from '../tabs.js';
import { el } from '../dom.js';

const SORTS = [
  { id: 'name', label: 'Name' },
  { id: 'lines', label: 'Lines ↓' },
  { id: 'cx', label: 'Complexity ↓' },
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
  for (const s of SORTS) {
    const opt = el('option', { value: s.id, text: s.label });
    if (s.id === STATE.functionsSort) opt.selected = true;
    sel.appendChild(opt);
  }
  wrap.appendChild(sel);
  wrap.appendChild(el('div', { cls: 'tb-spacer' }));
  const label = STATE.selectedPath
    ? `${count} functions in ${STATE.selectedPath.split(/[\\/]/).pop()}`
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
  for (const fn of fns) list.appendChild(row(fn, onChange));
  return list;
}

function row(fn, onChange) {
  const r = el('div', {
    cls: 'fn-row',
    on: {
      click: () => {
        selectPath(fn._file.path);
        setTraceRoot({ name: fn.name, file: fn._file.path, lineNum: fn.lineNum });
        setActiveTab('trace');
        onChange();
      },
    },
  });
  r.appendChild(el('span', { cls: 'fn-name', text: fn.name }));
  r.appendChild(el('span', { cls: 'fn-file', text: fn._file.name }));
  r.appendChild(el('span', { cls: 'fn-lines', text: `${fn.lines}L` }));
  r.appendChild(el('span', { cls: `cx-badge cx-${cxBucket(fn.cx)}`, text: String(fn.cx) }));
  return r;
}
