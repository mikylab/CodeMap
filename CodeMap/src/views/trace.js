import { STATE, setTraceRoot, selectPath } from '../state.js';
import { cxBucket } from '../tabs.js';
import { buildTraceTree, fnKey } from '../trace-graph.js';
import { el } from '../dom.js';

let selectedKey = null;
let lastRootKey = null;

export function renderTrace(onChange) {
  if (!STATE.files.length) return splash();
  const allFns = collectFns();
  if (!allFns.length) return splash();

  const root = resolveRoot(allFns);
  if (root && fnKey(root) !== lastRootKey) {
    selectedKey = fnKey(root);
    lastRootKey = fnKey(root);
  }

  const wrap = el('div', { cls: 'trace-root' });
  wrap.appendChild(header(allFns, root, onChange));
  wrap.appendChild(body(root, onChange));
  return wrap;
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-icon', text: '🧭' }),
    el('div', { cls: 'splash-title', text: 'No trace yet' }),
    el('div', { cls: 'splash-sub', text: 'Drop a folder, then pick a function to trace.' }),
  ]);
}

function collectFns() {
  const out = [];
  for (const f of STATE.files) for (const fn of f.fns) out.push(fn);
  return out;
}

function resolveRoot(allFns) {
  const r = STATE.traceRoot;
  if (!r) return allFns[0] || null;
  const hit = allFns.find(fn => fn.name === r.name && fn.file === r.file && fn.lineNum === r.lineNum);
  return hit || allFns[0] || null;
}

function header(allFns, root, onChange) {
  const strip = el('div', { cls: 'trace-header' });
  strip.appendChild(el('span', { cls: 'trace-hd-label', text: 'Root:' }));
  const sel = el('select', {
    cls: 'trace-select',
    on: {
      change: e => {
        const fn = allFns[Number(e.target.value)];
        setTraceRoot(fn);
        selectedKey = fnKey(fn);
        onChange();
      },
    },
  });
  for (let i = 0; i < allFns.length; i++) {
    const fn = allFns[i];
    const fname = fn.file.split(/[\\/]/).pop();
    const opt = el('option', { value: String(i), text: `${fn.name} (${fname})` });
    if (root && fnKey(fn) === fnKey(root)) opt.selected = true;
    sel.appendChild(opt);
  }
  strip.appendChild(sel);
  return strip;
}

function body(root, onChange) {
  const wrap = el('div', { cls: 'trace-body' });
  if (!root) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'no functions' }));
    return wrap;
  }
  const tree = buildTraceTree(root, STATE.files);
  const selected = findNode(tree, selectedKey) || tree;
  wrap.appendChild(treePane(tree, selected, onChange));
  wrap.appendChild(detailPane(selected.fn, onChange));
  return wrap;
}

function findNode(node, key) {
  if (!node) return null;
  if (fnKey(node.fn) === key) return node;
  for (const c of node.children) {
    const hit = findNode(c, key);
    if (hit) return hit;
  }
  return null;
}

function treePane(tree, selected, onChange) {
  const pane = el('div', { cls: 'trace-tree' });
  walk(tree, 0, pane, selected, onChange);
  return pane;
}

function walk(node, depth, pane, selected, onChange) {
  pane.appendChild(treeNode(node, depth, selected, onChange));
  for (const c of node.children) walk(c, depth + 1, pane, selected, onChange);
}

function treeNode(node, depth, selected, onChange) {
  const fn = node.fn;
  const wrap = el('div', {
    cls: `trace-node${fnKey(fn) === fnKey(selected.fn) ? ' active' : ''}`,
    style: { marginLeft: `${depth * 16}px` },
    on: { click: () => { selectedKey = fnKey(fn); onChange(); } },
  });
  const conn = el('div', { cls: 'trace-conn' });
  const dotCls = `trace-dot${node.children.length ? ' filled' : ''}${fn.cx >= 7 ? ' warn' : ''}`;
  conn.appendChild(el('div', { cls: dotCls }));
  wrap.appendChild(conn);
  const text = el('div', { cls: 'trace-node-text' });
  text.appendChild(el('div', { cls: 'trace-node-name', text: fn.name }));
  const fname = fn.file.split(/[\\/]/).pop();
  text.appendChild(el('div', { cls: 'trace-node-sub', text: `${fname} · L${fn.lineNum} · cx:${fn.cx}` }));
  wrap.appendChild(text);
  return wrap;
}

function detailPane(fn, onChange) {
  const pane = el('div', { cls: 'trace-detail' });
  pane.appendChild(el('div', { cls: 'trace-fn-name', text: `${fn.name}()` }));
  const meta = el('div', { cls: 'trace-fn-meta' });
  const fname = fn.file.split(/[\\/]/).pop();
  meta.appendChild(document.createTextNode(`${fname} · line ${fn.lineNum} · ${fn.lines} lines · complexity `));
  meta.appendChild(el('span', { cls: `cx-${cxBucket(fn.cx)}-fg`, text: String(fn.cx) }));
  pane.appendChild(meta);

  const file = STATE.byPath.get(fn.file);
  const siblings = file ? file.fns.filter(f => fnKey(f) !== fnKey(fn)) : [];
  if (siblings.length) {
    pane.appendChild(el('div', { cls: 'trace-section-label', text: 'Same-file functions' }));
    const row = el('div', { cls: 'trace-pill-row' });
    for (const s of siblings) {
      row.appendChild(el('button', {
        cls: 'pill out', type: 'button', text: `${s.name} →`,
        on: {
          click: () => {
            setTraceRoot(s);
            selectedKey = fnKey(s);
            onChange();
          },
        },
      }));
    }
    pane.appendChild(row);
  }

  pane.appendChild(el('div', { cls: 'trace-section-label', text: 'File' }));
  const filePath = el('button', {
    cls: 'trace-file-link', type: 'button', text: fn.file,
    on: { click: () => { selectPath(fn.file); onChange(); } },
  });
  pane.appendChild(filePath);
  return pane;
}
