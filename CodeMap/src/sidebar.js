import { STATE, selectPath, setSidebarFilter, visibleFiles } from './state.js';
import { cxBucket } from './tabs.js';
import { el, clear, alpha } from './dom.js';

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
  for (const f of visible) list.appendChild(fileItem(f, onChange));
  return list;
}

function fileItem(f, onChange) {
  const active = STATE.selectedPath === f.path;
  const item = el('div', {
    cls: 'file-item' + (active ? ' active' : ''),
    title: f.path,
    on: { click: () => { selectPath(f.path); onChange(); } },
  });
  item.appendChild(extBadge(f));
  item.appendChild(el('span', { cls: 'file-name', text: f.name }));
  item.appendChild(el('span', { cls: `file-cx cx-${cxBucket(f.cx)}-fg`, text: f.cx.toFixed(1) }));
  return item;
}

function extBadge(f) {
  return el('span', {
    cls: 'ext-badge', text: f.ext,
    style: { background: alpha(f.langColor, '22'), color: f.langColor },
  });
}
