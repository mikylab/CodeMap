// Singleton hover popover for clickable source links. One mouseover/mouseout
// listener per <pre>; positioning via getBoundingClientRect on the anchor.

import { STATE, selectFn, setDetailMode, pushHistory, captureSnapshot } from '../state.js';
import { el } from '../dom.js';

let popover = null;
let showTimer = null;
let hideTimer = null;
let activeAnchor = null;

export function attachSourcePopover(preEl) {
  preEl.addEventListener('mouseover', onOver);
  preEl.addEventListener('mouseout', onOut);
  preEl.addEventListener('focusin', onOver);
  preEl.addEventListener('focusout', onOut);
}

function onOver(e) {
  const link = e.target.closest('.src-link');
  if (!link || link === activeAnchor) return;
  clearTimeout(hideTimer);
  clearTimeout(showTimer);
  showTimer = setTimeout(() => showFor(link), 120);
}

function onOut(e) {
  const link = e.target.closest('.src-link');
  if (!link) return;
  clearTimeout(showTimer);
  hideTimer = setTimeout(hide, 200);
}

function showFor(link) {
  const kind = link.dataset.kind;
  const target = link.dataset.target;
  if (!kind) return;
  let content = null;
  if (kind === 'call' && target) {
    const fn = STATE.fnByKey.get(target);
    if (!fn) return;
    content = renderFnCard(fn);
  } else if (kind === 'import' && target) {
    const f = STATE.byPath.get(target);
    if (!f) return;
    content = renderFileCard(f);
  } else {
    return;
  }
  ensurePopover();
  popover.replaceChildren(content);
  position(link);
  popover.classList.add('show');
  activeAnchor = link;
}

function hide() {
  if (!popover) return;
  popover.classList.remove('show');
  activeAnchor = null;
}

function ensurePopover() {
  if (popover) return;
  popover = el('div', { cls: 'src-popover' });
  popover.addEventListener('mouseover', () => clearTimeout(hideTimer));
  popover.addEventListener('mouseout', () => { hideTimer = setTimeout(hide, 200); });
  document.body.appendChild(popover);
}

function position(anchor) {
  const r = anchor.getBoundingClientRect();
  popover.style.left = Math.max(8, r.left) + 'px';
  popover.style.top = (r.bottom + 4) + 'px';
}

function renderFnCard(fn) {
  const wrap = el('div', { cls: 'src-pop-card' });
  const head = el('div', { cls: 'src-pop-head' });
  head.appendChild(el('span', { cls: 'src-pop-icon', text: 'ƒ' }));
  head.appendChild(el('span', { cls: 'src-pop-name', text: fn.name + '()' }));
  head.appendChild(el('span', { cls: 'src-pop-loc', text: `${fn.file}:${fn.lineNum}` }));
  wrap.appendChild(head);
  if (fn.doc) {
    const firstLine = fn.doc.split('\n').find(l => l.trim()) || '';
    const truncated = firstLine.length > 120 ? firstLine.slice(0, 117) + '…' : firstLine;
    wrap.appendChild(el('div', { cls: 'src-pop-doc', text: truncated }));
  }
  const actions = el('div', { cls: 'src-pop-actions' });
  actions.appendChild(el('button', {
    cls: 'src-pop-btn', type: 'button', text: 'Open →',
    on: { click: () => {
      pushHistory(captureSnapshot());
      selectFn(fn);
      setDetailMode('source');
      hide();
      document.dispatchEvent(new CustomEvent('codemap:rerender'));
    } },
  }));
  actions.appendChild(el('button', {
    cls: 'src-pop-btn', type: 'button', text: 'Open Flow →',
    on: { click: () => {
      pushHistory(captureSnapshot());
      selectFn(fn);
      setDetailMode('flow');
      hide();
      document.dispatchEvent(new CustomEvent('codemap:rerender'));
    } },
  }));
  wrap.appendChild(actions);
  return wrap;
}

function renderFileCard(f) {
  const wrap = el('div', { cls: 'src-pop-card' });
  const head = el('div', { cls: 'src-pop-head' });
  head.appendChild(el('span', { cls: 'src-pop-icon', text: '📄' }));
  head.appendChild(el('span', { cls: 'src-pop-name', text: f.path }));
  wrap.appendChild(head);
  if (f.fileDoc) {
    const firstLine = f.fileDoc.split('\n').find(l => l.trim()) || '';
    const truncated = firstLine.length > 120 ? firstLine.slice(0, 117) + '…' : firstLine;
    wrap.appendChild(el('div', { cls: 'src-pop-doc', text: truncated }));
  }
  return wrap;
}
