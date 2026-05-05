import { STATE, selectPath, setSidebarFilter, visibleFiles, clearTraceHistory, setActiveTab, getTraceRoot, toggleDir, setSmellsFileFilter } from './state.js';
import { cxBucket } from './tabs.js';
import { fnKey } from './trace-graph.js';
import { el, clear, alpha } from './dom.js';
import { effectStrip } from './effect-badges.js';

export function renderSidebar(onChange) {
  const root = document.getElementById('sidebar');
  clear(root);
  root.appendChild(filesHeader());
  root.appendChild(filterInput(onChange));
  root.appendChild(fileList(onChange));
}

function filesHeader() {
  return el('div', { cls: 'sb-head' }, [
    el('span', { text: 'Files' }),
    el('span', { cls: 'sb-count', text: String(STATE.files.length) }),
  ]);
}

function filterInput(onChange) {
  const wrap = el('div', { cls: 'sb-filter' });
  const input = el('input', {
    type: 'text', placeholder: 'filter...', value: STATE.sidebarFilter,
    on: { input: e => { setSidebarFilter(e.target.value); onChange(); } },
  });
  wrap.appendChild(input);
  return wrap;
}

function fileList(onChange) {
  const list = el('div', { cls: 'sb-list' });
  const visible = visibleFiles();
  if (!visible.length) {
    list.appendChild(el('div', { cls: 'sb-empty', text: STATE.files.length ? 'no matches' : 'drop a folder' }));
    return list;
  }
  const root = getTraceRoot();
  const activeFnKey = root ? fnKey(root) : null;
  const filtering = !!STATE.sidebarFilter;
  const tree = buildTree(visible);
  appendNode(list, tree, 0, activeFnKey, filtering, onChange);
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

function appendNode(list, node, depth, activeFnKey, filtering, onChange) {
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const d of dirs) {
    const expanded = filtering || STATE.expandedDirs.has(d.path);
    list.appendChild(dirItem(d, depth, expanded, onChange));
    if (expanded) appendNode(list, d, depth + 1, activeFnKey, filtering, onChange);
  }
  const files = node.files.slice().sort((a, b) => a.name.localeCompare(b.name));
  for (const f of files) {
    list.appendChild(fileItem(f, depth, onChange));
    const fxe = STATE.fileEffects && STATE.fileEffects.get(f.path);
    if (fxe && (fxe.direct.size || fxe.inherited.size)) {
      const strip = effectStrip(fxe);
      strip.style.paddingLeft = (10 + depth * 12 + 24) + 'px';
      list.appendChild(strip);
    }
    if (STATE.selectedPath === f.path) list.appendChild(fnList(f, depth, activeFnKey, onChange));
  }
}

function dirItem(d, depth, expanded, onChange) {
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

function fileItem(f, depth, onChange) {
  const active = STATE.selectedPath === f.path;
  const item = el('div', {
    cls: 'file-item' + (active ? ' active' : ''),
    title: f.path,
    style: { paddingLeft: (10 + depth * 12) + 'px' },
    on: { click: () => { selectPath(f.path); onChange(); } },
  });
  item.appendChild(el('span', { cls: 'sb-twirl', text: active ? '▾' : '▸' }));
  item.appendChild(smellDot(f, onChange));
  item.appendChild(extBadge(f));
  item.appendChild(el('span', { cls: 'file-name', text: f.name }));
  item.appendChild(el('span', { cls: `file-cx cx-${cxBucket(f.cx)}-fg`, text: f.cx.toFixed(1) }));
  return item;
}

function fnList(f, depth, activeFnKey, onChange) {
  const wrap = el('div', {
    cls: 'sb-fn-list',
    style: { marginLeft: (10 + depth * 12) + 'px' },
  });
  if (!f.fns.length) {
    wrap.appendChild(el('div', { cls: 'sb-fn-empty', text: 'no functions detected' }));
    return wrap;
  }
  const fns = f.fns.slice().sort((a, b) => a.lineNum - b.lineNum);
  for (const fn of fns) {
    const isActive = fnKey(fn) === activeFnKey;
    wrap.appendChild(el('button', {
      cls: `sb-fn${isActive ? ' active' : ''}`,
      type: 'button',
      title: `${fn.name}() · L${fn.lineNum} · cx:${fn.cx}`,
      on: {
        click: () => {
          clearTraceHistory(fn);
          setActiveTab('trace');
          onChange();
        },
      },
    }, [
      el('span', { cls: 'sb-fn-name', text: fn.name }),
      el('span', { cls: `sb-fn-cx cx-${cxBucket(fn.cx)}-fg`, text: String(fn.cx) }),
    ]));
  }
  return wrap;
}

function smellDot(f, onChange) {
  const findings = STATE.smellsByFile && STATE.smellsByFile.get(f.path);
  if (!findings || !findings.length) return el('span', { cls: 'smell-dot smell-dot-none' });
  const warns = findings.filter(x => x.severity === 'warn').length;
  const cls = warns ? 'smell-dot smell-dot-warn' : 'smell-dot smell-dot-info';
  return el('span', {
    cls,
    title: `${findings.length} smell${findings.length === 1 ? '' : 's'} (${warns} warn, ${findings.length - warns} info)`,
    on: {
      click: e => {
        e.stopPropagation();
        setSmellsFileFilter(f.path);
        setActiveTab('smells');
        onChange();
      },
    },
  });
}

function extBadge(f) {
  return el('span', {
    cls: 'ext-badge', text: f.ext,
    style: { background: alpha(f.langColor, '22'), color: f.langColor },
  });
}
