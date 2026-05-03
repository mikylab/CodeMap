import { STATE, setTraceRoot, setTraceView, selectPath } from '../state.js';
import { cxBucket } from '../tabs.js';
import { buildTraceTree, fnKey } from '../trace-graph.js';
import { el, basename } from '../dom.js';
import { renderTraceGraph } from './trace-graph-view.js';

let selectedKey = null;
let lastRootKey = null;

export function renderTrace(onChange) {
  const allFns = STATE.allFns;
  if (!STATE.files.length || !allFns.length) return splash();

  const root = resolveRoot(allFns);
  if (root && fnKey(root) !== lastRootKey) {
    selectedKey = fnKey(root);
    lastRootKey = fnKey(root);
  }

  const wrap = el('div', { cls: 'trace-root' });
  wrap.appendChild(el('div', {
    cls: 'view-hint',
    text: 'Tree shows inferred callees from regex call-site detection. Edges are colored by confidence (same-file, import-disambiguated, or single-name match). Ambiguous and unresolved calls are flagged.',
  }));
  wrap.appendChild(header(allFns, root, onChange));
  wrap.appendChild(body(root, onChange));
  return wrap;
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-icon', text: 'TRACE' }),
    el('div', { cls: 'splash-title', text: 'No trace yet' }),
    el('div', { cls: 'splash-sub', text: 'Drop a folder, then pick a function to trace.' }),
  ]);
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
    const opt = el('option', { value: String(i), text: `${fn.name} (${basename(fn.file)})` });
    if (root && fnKey(fn) === fnKey(root)) opt.selected = true;
    sel.appendChild(opt);
  }
  strip.appendChild(sel);

  const spacer = el('div', { style: { flex: '1' } });
  strip.appendChild(spacer);

  const toggle = el('div', { cls: 'trace-view-toggle' });
  toggle.appendChild(viewBtn('tree', 'Tree', onChange));
  toggle.appendChild(viewBtn('graph', 'Graph', onChange));
  strip.appendChild(toggle);
  return strip;
}

function viewBtn(view, label, onChange) {
  const active = STATE.traceView === view;
  return el('button', {
    cls: `trace-view-btn${active ? ' active' : ''}`,
    type: 'button',
    text: label,
    on: { click: () => { setTraceView(view); onChange(); } },
  });
}

function body(root, onChange) {
  const wrap = el('div', { cls: 'trace-body' });
  if (!root) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'no functions' }));
    return wrap;
  }
  const tree = buildTraceTree(root, STATE.callsByFn, STATE.fnByKey);
  const selected = findNode(tree, selectedKey) || tree;

  if (STATE.traceView === 'graph') {
    wrap.classList.add('graph-mode');
    wrap.appendChild(renderTraceGraph(tree, selected, key => {
      selectedKey = key;
      onChange();
    }, fn => {
      setTraceRoot(fn);
      selectedKey = fnKey(fn);
      onChange();
    }));
  } else {
    wrap.appendChild(treePane(tree, selected, onChange));
  }
  wrap.appendChild(detailPane(selected, onChange));
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
  const isSelected = fnKey(fn) === fnKey(selected.fn);
  const wrap = el('div', {
    cls: `trace-node${isSelected ? ' active' : ''}${node.unresolved ? ' unresolved' : ''}`,
    style: { marginLeft: `${depth * 16}px` },
    on: { click: () => { if (!node.unresolved) { selectedKey = fnKey(fn); onChange(); } } },
  });
  const conn = el('div', { cls: 'trace-conn' });
  const dotCls = dotClass(node);
  conn.appendChild(el('div', { cls: dotCls }));
  wrap.appendChild(conn);
  const text = el('div', { cls: 'trace-node-text' });
  const nameRow = el('div', { cls: 'trace-node-name' });
  nameRow.appendChild(document.createTextNode(fn.name));
  if (node.confidence && depth > 0 && !node.unresolved) {
    nameRow.appendChild(el('span', { cls: `conf-badge conf-${node.confidence}`, text: confLabel(node.confidence) }));
  }
  if (node.ambiguous) nameRow.appendChild(el('span', { cls: 'conf-badge conf-amb', text: '?' }));
  if (node.cycle) nameRow.appendChild(el('span', { cls: 'conf-badge conf-cycle', text: 'cycle' }));
  text.appendChild(nameRow);
  const subText = node.unresolved
    ? '(external / unresolved)'
    : `${basename(fn.file)} · L${fn.lineNum} · cx:${fn.cx}`;
  text.appendChild(el('div', { cls: 'trace-node-sub', text: subText }));
  wrap.appendChild(text);
  return wrap;
}

function dotClass(node) {
  const parts = ['trace-dot'];
  if (node.children.length) parts.push('filled');
  if (node.fn.cx >= 7 && !node.unresolved) parts.push('warn');
  if (node.unresolved) parts.push('unresolved');
  if (node.ambiguous) parts.push('ambiguous');
  if (node.confidence) parts.push(`conf-${node.confidence}`);
  return parts.join(' ');
}

function confLabel(c) {
  if (c === 'high') return 'same-file';
  if (c === 'med') return 'imported';
  return 'guess';
}

function detailPane(selected, onChange) {
  const pane = el('div', { cls: 'trace-detail' });
  const fn = selected.fn;
  if (selected.unresolved) {
    pane.appendChild(el('div', { cls: 'trace-fn-name', text: `${fn.name}()` }));
    pane.appendChild(el('div', { cls: 'trace-fn-meta', text: 'External call or unresolvable name. Likely a library function, builtin, or method on a value the heuristic can\'t track.' }));
    return pane;
  }

  pane.appendChild(el('div', { cls: 'trace-fn-name', text: `${fn.name}()` }));
  const meta = el('div', { cls: 'trace-fn-meta' });
  meta.appendChild(document.createTextNode(`${basename(fn.file)} · line ${fn.lineNum} · ${fn.lines} lines · complexity `));
  meta.appendChild(el('span', { cls: `cx-${cxBucket(fn.cx)}-fg`, text: String(fn.cx) }));
  pane.appendChild(meta);

  const key = fnKey(fn);
  const fanIn = STATE.fanIn.get(key) || 0;
  const fanOut = STATE.fanOut.get(key) || 0;
  const badges = el('div', { cls: 'trace-badge-row' });
  badges.appendChild(el('span', { cls: 'trace-badge', text: `fan-in ${fanIn}` }));
  badges.appendChild(el('span', { cls: 'trace-badge', text: `fan-out ${fanOut}` }));
  if (selected.confidence && selected !== null) {
    badges.appendChild(el('span', { cls: `trace-badge conf-${selected.confidence}`, text: confLabel(selected.confidence) }));
  }
  if (selected.ambiguous) badges.appendChild(el('span', { cls: 'trace-badge conf-amb', text: 'ambiguous' }));
  pane.appendChild(badges);

  // Callers
  const callers = STATE.callersByFn.get(key) || [];
  if (callers.length) {
    pane.appendChild(el('div', { cls: 'trace-section-label', text: 'Callers' }));
    const row = el('div', { cls: 'trace-pill-row' });
    for (const c of callers) {
      const callerFn = STATE.fnByKey.get(c.from);
      if (!callerFn) continue;
      row.appendChild(el('button', {
        cls: `pill in conf-${c.confidence}`,
        type: 'button',
        text: `← ${callerFn.name}`,
        title: `${basename(callerFn.file)} · L${callerFn.lineNum}`,
        on: {
          click: () => {
            setTraceRoot(callerFn);
            selectedKey = fnKey(callerFn);
            onChange();
          },
        },
      }));
    }
    pane.appendChild(row);
  }

  // Calls
  const calls = STATE.callsByFn.get(key) || [];
  if (calls.length) {
    pane.appendChild(el('div', { cls: 'trace-section-label', text: 'Calls' }));
    const row = el('div', { cls: 'trace-pill-row' });
    for (const e of calls) {
      const targetFn = e.resolved ? STATE.fnByKey.get(e.target) : null;
      const cls = `pill out conf-${e.confidence}${e.ambiguous ? ' amb' : ''}${e.resolved ? '' : ' unresolved'}`;
      const text = e.resolved ? `${e.name} →` : `${e.name} (?)`;
      row.appendChild(el('button', {
        cls,
        type: 'button',
        text,
        title: targetFn ? `${basename(targetFn.file)} · L${targetFn.lineNum}` : 'unresolved',
        on: {
          click: () => {
            if (!targetFn) return;
            setTraceRoot(targetFn);
            selectedKey = fnKey(targetFn);
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
