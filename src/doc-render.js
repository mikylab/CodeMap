// Render a captured markdown doc into the workspace.
//
// Pipeline:
//   1. renderMarkdown(raw)         — markdown → DOM
//   2. autolink(STATE.files, STATE.fnByName)
//                                  — wrap inline-code (and bare path/funcName()
//                                    text) in click-to-navigate buttons
//   3. lineageSwap()              — if the doc has a "### Branch lineage"
//                                    heading and STATE.lineage is set, replace
//                                    that section's body with the interactive
//                                    lineage tree component.

import { STATE, pushHistory, captureSnapshot, selectFile, selectFn, selectDoc, clearSelectedDoc, goBack } from './state.js';
import { el } from './dom.js';
import { renderMarkdown } from './markdown.js';
import { renderLineageTree } from './lineage-render.js';

export function renderDoc(doc, onChange) {
  const wrap = el('div', { cls: 'ws-doc' });
  const inner = el('div', { cls: 'ws-doc-inner' });
  const head = el('div', { cls: 'ws-doc-head' });
  const left = el('div', { cls: 'ws-doc-head-left' });
  if (STATE.history.length) {
    left.appendChild(el('button', {
      cls: 'ws-back-btn', type: 'button', text: '←',
      title: 'Back (Backspace / Alt+←)',
      on: { click: () => { goBack(); onChange(); } },
    }));
  }
  left.appendChild(el('span', { cls: 'ws-doc-path', text: doc.path }));
  head.appendChild(left);

  const right = el('div', { cls: 'ws-doc-head-right' });
  if (STATE.docs.length > 1) right.appendChild(docSwitcher(doc, onChange));
  right.appendChild(el('button', {
    cls: 'ws-close', type: 'button', text: '✕',
    title: 'Close doc — back to repo overview',
    on: { click: () => { clearSelectedDoc(); onChange(); } },
  }));
  head.appendChild(right);
  inner.appendChild(head);

  const body = renderMarkdown(doc.raw);
  autolink(body, onChange);
  swapLineageSection(body, onChange);
  inner.appendChild(body);
  wrap.appendChild(inner);
  return wrap;
}

function docSwitcher(currentDoc, onChange) {
  const sel = el('select', {
    cls: 'ws-doc-switcher',
    title: 'Switch to another doc',
    on: { change: e => {
      const path = e.target.value;
      if (path && path !== currentDoc.path) { selectDoc(path); onChange(); }
    } },
  });
  const docs = STATE.docs.slice().sort((a, b) => {
    const score = d => /^readme/i.test(d.name) ? 0 : (d.path.includes('/') ? 2 : 1);
    const sa = score(a), sb = score(b);
    return sa !== sb ? sa - sb : a.path.localeCompare(b.path);
  });
  for (const d of docs) {
    const opt = document.createElement('option');
    opt.value = d.path;
    opt.textContent = d.path;
    if (d.path === currentDoc.path) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

// ─── Auto-linking ────────────────────────────────────────────────────────
function autolink(root, onChange) {
  const pathSet = new Set(STATE.files.map(f => f.path));
  const basenameMap = new Map();
  for (const f of STATE.files) {
    if (!basenameMap.has(f.name)) basenameMap.set(f.name, f.path);
  }
  const fnNames = STATE.fnByName;
  // First pass: rewrite inline-code nodes.
  for (const code of [...root.querySelectorAll('code.md-icode')]) {
    const text = code.textContent.trim();
    if (!text) continue;
    const path = resolveFile(text, pathSet, basenameMap);
    if (path) { replaceWithFileLink(code, path, onChange); continue; }
    const fnHit = resolveFn(text, fnNames);
    if (fnHit) { replaceWithFnLink(code, fnHit, onChange); continue; }
  }
  // Second pass intentionally skipped in v1 — auto-linking plain prose risks
  // false positives (matching the word "test" or "config" as a fn name). The
  // CLAUDE.md project convention is that the README author uses backticks for
  // identifiers; trusting backticks alone keeps this deterministic.
}

function resolveFile(text, pathSet, basenameMap) {
  if (pathSet.has(text)) return text;
  if (basenameMap.has(text)) return basenameMap.get(text);
  return null;
}

function resolveFn(text, fnNames) {
  const m = text.match(/^([A-Za-z_][\w$]*)\s*\(\s*\)$/);
  const name = m ? m[1] : text;
  return fnNames.get(name) || null;
}

function replaceWithFileLink(code, path, onChange) {
  const btn = el('button', {
    cls: 'md-link md-link-file', type: 'button',
    text: code.textContent,
    title: `Open ${path}`,
    on: { click: () => { pushHistory(captureSnapshot()); selectFile(path); onChange(); } },
  });
  code.replaceWith(btn);
}

function replaceWithFnLink(code, fn, onChange) {
  const btn = el('button', {
    cls: 'md-link md-link-fn', type: 'button',
    text: code.textContent,
    title: `Open ${fn.name}() — ${fn.file}:${fn.lineNum}`,
    on: { click: () => { pushHistory(captureSnapshot()); selectFn(fn); onChange(); } },
  });
  code.replaceWith(btn);
}

// ─── Lineage section swap ─────────────────────────────────────────────────
function swapLineageSection(root, onChange) {
  if (!STATE.lineage) return;
  const headings = [...root.querySelectorAll('h2, h3, h4')];
  const target = headings.find(h => /^branch\s+lineage$/i.test(h.textContent.trim()));
  if (!target) return;
  const targetLevel = parseInt(target.tagName.slice(1), 10);

  // Remove subsequent siblings until we hit a heading of equal-or-higher level.
  let node = target.nextElementSibling;
  const removed = [];
  while (node) {
    if (/^H[1-6]$/.test(node.tagName)) {
      const lvl = parseInt(node.tagName.slice(1), 10);
      if (lvl <= targetLevel) break;
    }
    removed.push(node);
    node = node.nextElementSibling;
  }
  for (const n of removed) n.remove();

  const treeHost = el('div', { cls: 'md-lineage-inline' });
  renderLineageTree(treeHost, STATE.lineage, { compact: true, onChange });
  target.after(treeHost);
}
