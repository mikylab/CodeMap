import { STATE, toggleSmellKindFilter, clearSmellsFileFilter, selectFile, exitFullscreen } from '../state.js';
import { el } from '../dom.js';
import { smellExportBar } from '../smells-export.js';

const KINDS = [
  { id: 'unresolved-call',   label: 'hallucinated' },
  { id: 'broken-import',     label: 'broken-import' },
  { id: 'suspicious-comment',label: 'suspicious' },
  { id: 'empty-catch',       label: 'swallowed' },
  { id: 'placeholder',       label: 'placeholders' },
];

export function renderSmells(onChange) {
  const wrap = el('div', { cls: 'smells-root' });
  if (!STATE.files.length) {
    wrap.appendChild(el('div', { cls: 'upload-splash' }, [
      el('div', { cls: 'splash-title', text: 'No smells yet' }),
      el('div', { cls: 'splash-sub', text: 'Drop a folder to scan it for hallucinated calls, suspicious comments, swallowed errors, and placeholders.' }),
    ]));
    return wrap;
  }
  wrap.appendChild(el('div', { cls: 'view-hint' }, [
    el('span', { cls: 'view-hint-name', text: 'Smells' }),
    el('span', { text: ' — Heuristic findings for code that may not behave as it claims. Filter by kind. Click a finding to open the file.' }),
  ]));
  wrap.appendChild(chips(onChange));
  if (STATE.smellsFileFilter) wrap.appendChild(fileChip(onChange));
  const filtered = currentFiltered();
  if (filtered.length) {
    const slug = STATE.smellsFileFilter
      ? STATE.smellsFileFilter.replace(/[\\/]/g, '_')
      : (STATE.smellsKindFilter.size ? [...STATE.smellsKindFilter].sort().join('-') : 'all');
    wrap.appendChild(smellExportBar(filtered, slug));
  }
  wrap.appendChild(list(onChange));
  return wrap;
}

function currentFiltered() {
  let items = STATE.smells;
  if (STATE.smellsKindFilter.size) items = items.filter(f => STATE.smellsKindFilter.has(f.kind));
  if (STATE.smellsFileFilter) items = items.filter(f => f.file === STATE.smellsFileFilter);
  return items;
}

function chips(onChange) {
  const counts = countByKind(STATE.smells);
  const total = STATE.smells.length;
  const wrap = el('div', { cls: 'fn-fx-chips' });
  wrap.appendChild(el('span', { cls: 'fn-tb-count', text: `${total} finding${total === 1 ? '' : 's'}` }));
  for (const k of KINDS) {
    const on = STATE.smellsKindFilter.has(k.id);
    wrap.appendChild(el('button', {
      cls: `fn-fx-chip${on ? ' on effect-exec' : ''}`,
      type: 'button',
      text: `${k.label} ${counts.get(k.id) || 0}`,
      on: { click: () => { toggleSmellKindFilter(k.id); onChange(); } },
    }));
  }
  return wrap;
}

function fileChip(onChange) {
  const wrap = el('div', { cls: 'fn-fx-chips' });
  wrap.appendChild(el('span', { cls: 'fn-tb-count', text: `filter: ${STATE.smellsFileFilter}` }));
  wrap.appendChild(el('button', {
    cls: 'fn-fx-chip',
    type: 'button',
    text: 'clear file filter',
    on: { click: () => { clearSmellsFileFilter(); onChange(); } },
  }));
  return wrap;
}

function countByKind(findings) {
  const m = new Map();
  for (const f of findings) m.set(f.kind, (m.get(f.kind) || 0) + 1);
  return m;
}

function list(onChange) {
  const wrap = el('div', { cls: 'smells-list' });
  let items = STATE.smells;
  if (STATE.smellsKindFilter.size) items = items.filter(f => STATE.smellsKindFilter.has(f.kind));
  if (STATE.smellsFileFilter) items = items.filter(f => f.file === STATE.smellsFileFilter);
  if (!items.length) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'No smells match the current filters.' }));
    return wrap;
  }
  for (const f of items) wrap.appendChild(item(f, onChange));
  return wrap;
}

function item(f, onChange) {
  const row = el('div', { cls: `smell-item smell-${f.severity}` });
  const head = el('div', { cls: 'smell-head' });
  head.appendChild(el('span', { cls: `smell-sev sev-${f.severity}`, text: f.severity === 'warn' ? '⚠' : 'ℹ' }));
  head.appendChild(el('span', { cls: 'smell-loc', text: `${f.file}:${f.line}` }));
  head.appendChild(el('span', { cls: 'smell-kind', text: `${f.kind}${f.subkind ? ' · ' + f.subkind : ''}` }));
  row.appendChild(head);
  row.appendChild(el('div', { cls: 'smell-snippet', text: f.snippet }));
  const why = el('div', { cls: 'smell-why' });
  why.appendChild(el('span', { text: f.why }));
  if (f.fnName) why.appendChild(el('span', { cls: 'smell-fn', text: ` · fn: ${f.fnName}` }));
  why.appendChild(el('button', {
    cls: 'smell-open', type: 'button', text: 'open file',
    on: { click: () => { selectFile(f.file); exitFullscreen(); onChange(); } },
  }));
  row.appendChild(why);
  return row;
}
