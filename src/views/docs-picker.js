// Fullscreen Docs picker — lists every captured markdown doc with a
// searchable, scrollable grid. Clicking one selects the doc, closes the
// overlay, and renders it in the workspace.

import { STATE, selectDoc, exitFullscreen, setDocsPickerQuery } from '../state.js';
import { el } from '../dom.js';

export function renderDocsPicker(onChange) {
  const wrap = el('div', { cls: 'fs-docs' });
  wrap.appendChild(searchBar(onChange));
  const docs = filteredSorted();
  if (!docs.length) {
    wrap.appendChild(el('div', { cls: 'fs-docs-empty', text: 'no docs match' }));
    return wrap;
  }
  const list = el('div', { cls: 'fs-docs-list' });
  for (const d of docs) list.appendChild(docCard(d, onChange));
  wrap.appendChild(list);
  return wrap;
}

function searchBar(onChange) {
  const wrap = el('div', { cls: 'fs-docs-filter' });
  const input = el('input', {
    type: 'text',
    placeholder: `search ${STATE.docs.length} docs by path…`,
    value: STATE.docsPickerQuery || '',
    on: { input: e => { setDocsPickerQuery(e.target.value); onChange(); } },
  });
  wrap.appendChild(input);
  return wrap;
}

function filteredSorted() {
  const q = (STATE.docsPickerQuery || '').trim().toLowerCase();
  const docs = STATE.docs.slice();
  docs.sort((a, b) => {
    const score = d => /^readme/i.test(d.name) ? 0 : (d.path.includes('/') ? 2 : 1);
    const sa = score(a), sb = score(b);
    return sa !== sb ? sa - sb : a.path.localeCompare(b.path);
  });
  if (!q) return docs;
  return docs.filter(d => d.path.toLowerCase().includes(q));
}

function docCard(d, onChange) {
  const active = STATE.selectedDoc === d.path;
  const preview = previewOf(d.raw);
  const btn = el('button', {
    cls: 'fs-doc-card' + (active ? ' active' : ''),
    type: 'button',
    title: d.path,
    on: { click: () => { selectDoc(d.path); exitFullscreen(); onChange(); } },
  });
  btn.appendChild(el('div', { cls: 'fs-doc-path', text: d.path }));
  if (preview) btn.appendChild(el('div', { cls: 'fs-doc-preview', text: preview }));
  return btn;
}

function previewOf(raw) {
  if (!raw) return '';
  const lines = raw.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^#{1,6}\s/.test(t)) continue;
    if (/^```/.test(t)) continue;
    if (t.length < 8) continue;
    return t.slice(0, 140);
  }
  return '';
}
