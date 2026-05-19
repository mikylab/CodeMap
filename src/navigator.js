import {
  STATE, setNavSearch, toggleDir, selectFile, selectFn, clearSelection,
} from './state.js';
import { cxBucket } from './tabs.js';
import { fnKey } from './trace-graph.js';
import { el, clear, alpha } from './dom.js';
import { effectStrip } from './effect-badges.js';

export function renderNavigator(onChange) {
  const root = document.getElementById('navigator');
  clear(root);
  root.appendChild(header(onChange));
  root.appendChild(searchInput(onChange));
  if (!STATE.files.length) {
    root.appendChild(el('div', { cls: 'sb-empty', text: 'drop a folder' }));
    return;
  }
  if (isSearching()) {
    root.appendChild(searchResults(onChange));
  } else {
    root.appendChild(fileTree(onChange));
  }
}

function header(onChange) {
  const head = el('div', { cls: 'sb-head' });
  head.appendChild(el('button', {
    cls: 'sb-home' + (!STATE.selectedPath && !STATE.selectedFnKey ? ' active' : ''),
    type: 'button',
    text: '⌂ Repo',
    title: 'Show repo-level overview',
    on: { click: () => { clearSelection(); onChange(); } },
  }));
  head.appendChild(el('span', { cls: 'sb-count', text: `${STATE.files.length} files` }));
  return head;
}

function searchInput(onChange) {
  const wrap = el('div', { cls: 'sb-filter' });
  const input = el('input', {
    type: 'text',
    placeholder: 'search files & functions…',
    value: STATE.navSearch,
    on: { input: e => { setNavSearch(e.target.value); onChange(); } },
  });
  wrap.appendChild(input);
  if (STATE.navSearch) {
    wrap.appendChild(el('button', {
      cls: 'sb-filter-clear', type: 'button', text: '✕',
      title: 'Clear search',
      on: { click: () => { setNavSearch(''); onChange(); } },
    }));
  }
  return wrap;
}

function isSearching() {
  return STATE.navSearch.trim().length > 0 || STATE.fnEffectFilter.size > 0;
}

function passesEffect(fn) {
  const fx = STATE.fnEffectFilter;
  if (!fx.size) return true;
  const e = STATE.effects.get(fnKey(fn));
  if (!e) return false;
  for (const t of fx) if (e.direct.has(t) || e.inherited.has(t)) return true;
  return false;
}

function fileHasMatchingFn(f) {
  return f.fns.some(passesEffect);
}

function searchResults(onChange) {
  const list = el('div', { cls: 'sb-list sb-results' });
  const q = STATE.navSearch.trim().toLowerCase();
  const results = [];
  for (const f of STATE.files) {
    const fileMatches = !q || f.path.toLowerCase().includes(q);
    if (fileMatches && (STATE.fnEffectFilter.size === 0 || fileHasMatchingFn(f))) {
      results.push({ kind: 'file', f });
    }
    for (const fn of f.fns) {
      const fnMatches = !q || fn.name.toLowerCase().includes(q);
      if (fnMatches && passesEffect(fn)) results.push({ kind: 'fn', f, fn });
    }
  }
  if (!results.length) {
    list.appendChild(el('div', { cls: 'sb-empty', text: 'no matches' }));
    return list;
  }
  list.appendChild(el('div', { cls: 'sb-results-count', text: `${results.length} result${results.length === 1 ? '' : 's'}` }));
  const limit = 200;
  for (const r of results.slice(0, limit)) {
    if (r.kind === 'file') list.appendChild(fileRow(r.f, 0, onChange));
    else list.appendChild(fnRow(r.fn, r.f, onChange, true));
  }
  if (results.length > limit) {
    list.appendChild(el('div', { cls: 'sb-results-more', text: `+${results.length - limit} more — refine the search to see them.` }));
  }
  return list;
}

function fileTree(onChange) {
  const list = el('div', { cls: 'sb-list' });
  const tree = buildTree(STATE.files);
  appendTreeNode(list, tree, 0, onChange);
  return list;
}

function buildTree(files) {
  const root = { name: '', path: '', dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      let child = node.dirs.get(seg);
      if (!child) {
        const dirPath = node.path ? `${node.path}/${seg}` : seg;
        child = { name: seg, path: dirPath, dirs: new Map(), files: [] };
        node.dirs.set(seg, child);
      }
      node = child;
    }
    node.files.push(f);
  }
  return root;
}

function appendTreeNode(list, node, depth, onChange) {
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const d of dirs) {
    const expanded = STATE.expandedDirs.has(d.path);
    list.appendChild(dirRow(d, depth, expanded, onChange));
    if (expanded) appendTreeNode(list, d, depth + 1, onChange);
  }
  const files = node.files.slice().sort((a, b) => a.name.localeCompare(b.name));
  for (const f of files) {
    list.appendChild(fileRow(f, depth, onChange));
    if (STATE.selectedPath === f.path) list.appendChild(fnSubList(f, depth, onChange));
  }
}

function dirRow(d, depth, expanded, onChange) {
  const fileCount = countFiles(d);
  const item = el('div', {
    cls: 'dir-item',
    title: d.path,
    style: { paddingLeft: (10 + depth * 12) + 'px' },
    on: { click: () => { toggleDir(d.path); onChange(); } },
  });
  item.appendChild(el('span', { cls: 'sb-twirl', text: expanded ? '▾' : '▸' }));
  item.appendChild(el('span', { cls: 'dir-icon', text: expanded ? '📂' : '📁' }));
  item.appendChild(el('span', { cls: 'dir-name', text: d.name }));
  item.appendChild(el('span', { cls: 'dir-count', text: String(fileCount) }));
  return item;
}

function countFiles(node) {
  let n = node.files.length;
  for (const d of node.dirs.values()) n += countFiles(d);
  return n;
}

function fileRow(f, depth, onChange) {
  const active = STATE.selectedPath === f.path && !STATE.selectedFnKey;
  const item = el('div', {
    cls: 'file-item' + (active ? ' active' : ''),
    title: f.path,
    style: { paddingLeft: (10 + depth * 12) + 'px' },
    on: { click: () => { selectFile(f.path); onChange(); } },
  });
  item.appendChild(smellDot(f));
  item.appendChild(extBadge(f));
  item.appendChild(el('span', { cls: 'file-name', text: f.name }));
  item.appendChild(el('span', { cls: `file-cx cx-${cxBucket(f.cx)}-fg`, text: f.cx.toFixed(1) }));
  return item;
}

function fnSubList(f, depth, onChange) {
  const wrap = el('div', {
    cls: 'sb-fn-list',
    style: { paddingLeft: (10 + (depth + 1) * 12) + 'px' },
  });
  const fxe = STATE.fileEffects && STATE.fileEffects.get(f.path);
  if (fxe && (fxe.direct.size || fxe.inherited.size)) {
    wrap.appendChild(effectStrip(fxe));
  }
  if (!f.fns.length) {
    wrap.appendChild(el('div', { cls: 'sb-fn-empty', text: 'no functions detected' }));
    return wrap;
  }
  const fns = f.fns.slice().sort((a, b) => a.lineNum - b.lineNum);
  for (const fn of fns) wrap.appendChild(fnRow(fn, f, onChange, false));
  return wrap;
}

function fnRow(fn, f, onChange, withFile) {
  const key = fnKey(fn);
  const active = STATE.selectedFnKey === key;
  const row = el('button', {
    cls: 'sb-fn' + (active ? ' active' : ''),
    type: 'button',
    title: `${fn.name}() · ${f.path} · L${fn.lineNum} · cx:${fn.cx}`,
    on: { click: () => { selectFn(fn); onChange(); } },
  });
  row.appendChild(el('span', { cls: 'sb-fn-name', text: fn.name }));
  if (withFile) row.appendChild(el('span', { cls: 'sb-fn-file', text: f.name }));
  row.appendChild(el('span', { cls: `sb-fn-cx cx-${cxBucket(fn.cx)}-fg`, text: String(fn.cx) }));
  return row;
}

function smellDot(f) {
  const findings = STATE.smellsByFile && STATE.smellsByFile.get(f.path);
  if (!findings || !findings.length) return el('span', { cls: 'smell-dot smell-dot-none' });
  const warns = findings.filter(x => x.severity === 'warn').length;
  const cls = warns ? 'smell-dot smell-dot-warn' : 'smell-dot smell-dot-info';
  return el('span', {
    cls,
    title: `${findings.length} smell${findings.length === 1 ? '' : 's'} (${warns} warn)`,
  });
}

function extBadge(f) {
  return el('span', {
    cls: 'ext-badge', text: f.ext,
    style: { background: alpha(f.langColor, '22'), color: f.langColor },
  });
}
