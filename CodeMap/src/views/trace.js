import { STATE, setTraceRoot, selectPath, gotoTraceHistory, clearTraceHistory, getTraceRoot } from '../state.js';
import { cxBucket } from '../tabs.js';
import { buildTraceTree, fnKey } from '../trace-graph.js';
import { el, basename } from '../dom.js';
import { renderTraceMap } from './trace-graph-view.js';

let selectedKey = null;
let cachedRootKey = null;
let cachedTree = null;
let cachedFilesRef = null;

function jumpTo(fn, onChange) {
  if (!fn) return;
  setTraceRoot(fn);
  selectPath(fn.file);
  selectedKey = fnKey(fn);
  onChange();
}

function selectNode(key, onChange) {
  if (selectedKey === key) return;
  selectedKey = key;
  onChange();
}

export function renderTrace(onChange) {
  if (!STATE.files.length) return splash();

  const root = currentRoot();
  if (!root) return pickPrompt();

  if (selectedKey == null || !STATE.fnByKey.get(selectedKey)) selectedKey = fnKey(root);

  const rootKey = fnKey(root);
  if (cachedRootKey !== rootKey || cachedFilesRef !== STATE.files) {
    cachedTree = buildTraceTree(root, STATE.callsByFn, STATE.fnByKey);
    cachedRootKey = rootKey;
    cachedFilesRef = STATE.files;
  }
  const tree = cachedTree;

  const wrap = el('div', { cls: 'trace-root' });
  wrap.appendChild(breadcrumbs(onChange));
  wrap.appendChild(hint(root, tree));
  wrap.appendChild(body(tree, onChange));
  return wrap;
}


function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-title', text: 'Drop a folder to begin' }),
    el('div', { cls: 'splash-sub', text: 'Then pick a file in the sidebar and click a function to trace its execution.' }),
  ]);
}

function pickPrompt() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-title', text: 'Pick a function' }),
    el('div', { cls: 'splash-sub', text: 'In the sidebar, click a file to expand its functions, then click a function to trace what it executes.' }),
  ]);
}

function currentRoot() {
  const r = getTraceRoot();
  return r ? STATE.fnByKey.get(fnKey(r)) || null : null;
}

function breadcrumbs(onChange) {
  const strip = el('div', { cls: 'trace-crumbs' });
  const history = STATE.traceHistory;
  const idx = STATE.traceHistoryIdx;
  if (!history.length) return strip;

  // Back / forward buttons
  strip.appendChild(el('button', {
    cls: 'crumb-nav', type: 'button', text: '←',
    title: 'Back to previous function',
    disabled: idx <= 0,
    on: { click: () => { gotoTraceHistory(idx - 1); onChange(); } },
  }));
  strip.appendChild(el('button', {
    cls: 'crumb-nav', type: 'button', text: '→',
    title: 'Forward',
    disabled: idx >= history.length - 1,
    on: { click: () => { gotoTraceHistory(idx + 1); onChange(); } },
  }));

  const trail = el('div', { cls: 'crumb-trail' });
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const isCurrent = i === idx;
    const isOrigin = i === 0;
    if (i > 0) trail.appendChild(el('span', { cls: 'crumb-sep', text: '›' }));
    trail.appendChild(el('button', {
      cls: `crumb${isCurrent ? ' current' : ''}${isOrigin ? ' origin' : ''}`,
      type: 'button',
      title: `${entry.file} · L${entry.lineNum}${isOrigin ? ' (origin)' : ''}`,
      text: `${entry.name}()`,
      on: { click: () => { gotoTraceHistory(i); onChange(); } },
    }));
  }
  strip.appendChild(trail);

  if (history.length > 1) {
    strip.appendChild(el('button', {
      cls: 'crumb-clear', type: 'button', text: 'reset',
      title: 'Clear trail and start fresh from this function',
      on: {
        click: () => {
          clearTraceHistory(STATE.fnByKey.get(fnKey(history[idx])));
          onChange();
        },
      },
    }));
  }
  return strip;
}

function hint(root, tree) {
  const reach = tree.subtree.reach;
  const depth = tree.subtree.depth;
  const filesTouched = tree.subtree.files.size;
  const hotspots = tree.subtree.hotspots;
  const text = `${root.file} → ${root.name}() touches ${reach} function${reach === 1 ? '' : 's'} across ${filesTouched} file${filesTouched === 1 ? '' : 's'}, max chain depth ${depth}, ${hotspots} complexity hotspot${hotspots === 1 ? '' : 's'}.`;
  return el('div', { cls: 'view-hint', text });
}

function body(tree, onChange) {
  const wrap = el('div', { cls: 'trace-body map-mode' });
  const selectedNode = findNode(tree, selectedKey) || tree;
  wrap.appendChild(renderTraceMap(
    tree, selectedNode,
    key => selectNode(key, onChange),
    fn => jumpTo(fn, onChange),
  ));
  wrap.appendChild(detailPane(tree, selectedNode, onChange));
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

function detailPane(tree, selected, onChange) {
  const pane = el('div', { cls: 'trace-detail' });

  pane.appendChild(el('div', { cls: 'trace-section-label', text: 'Map summary' }));
  pane.appendChild(summary(tree));

  const hotspots = collectHotspots(tree);
  if (hotspots.length) {
    pane.appendChild(el('div', { cls: 'trace-section-label', text: `Hotspots (cx ≥ 7)` }));
    const list = el('div', { cls: 'trace-pill-row' });
    for (const fn of hotspots.slice(0, 8)) {
      list.appendChild(el('button', {
        cls: 'pill conf-low',
        type: 'button',
        text: `${fn.name} (cx:${fn.cx})`,
        title: `${basename(fn.file)} · L${fn.lineNum}`,
        on: { click: () => jumpTo(fn, onChange) },
      }));
    }
    pane.appendChild(list);
  }

  pane.appendChild(el('div', { cls: 'trace-section-label', text: 'Selected node' }));
  pane.appendChild(nodeDetail(selected, onChange));

  return pane;
}

function summary(tree) {
  const grid = el('div', { cls: 'trace-summary-grid' });
  const cells = [
    { label: 'reach',    value: String(tree.subtree.reach),       hint: 'Functions reachable from this entry.' },
    { label: 'files',    value: String(tree.subtree.files.size),  hint: 'Distinct files involved in this execution path.' },
    { label: 'depth',    value: String(tree.subtree.depth),       hint: 'Longest call chain from this entry.', warn: tree.subtree.depth >= 5 },
    { label: 'hotspots', value: String(tree.subtree.hotspots),    hint: 'Functions in the chain with cyclomatic complexity ≥ 7.', warn: tree.subtree.hotspots > 0 },
  ];
  for (const c of cells) {
    const cell = el('div', { cls: `trace-summary-cell${c.warn ? ' warn' : ''}`, title: c.hint });
    cell.appendChild(el('div', { cls: 'trace-summary-val', text: c.value }));
    cell.appendChild(el('div', { cls: 'trace-summary-lbl', text: c.label }));
    grid.appendChild(cell);
  }
  return grid;
}

function nodeDetail(selected, onChange) {
  const wrap = el('div', { cls: 'trace-node-detail' });
  const fn = selected.fn;

  const title = el('div', { cls: 'trace-fn-name' });
  title.appendChild(document.createTextNode(`${fn.name}()`));
  if (selected.cycle) title.appendChild(el('span', { cls: 'conf-badge conf-cycle', text: 'cycle' }));
  if (selected.ambiguous) title.appendChild(el('span', { cls: 'conf-badge conf-amb', text: 'ambiguous' }));
  wrap.appendChild(title);

  const meta = el('div', { cls: 'trace-fn-meta' });
  meta.appendChild(document.createTextNode(`${basename(fn.file)} · line ${fn.lineNum} · ${fn.lines} lines · complexity `));
  meta.appendChild(el('span', { cls: `cx-${cxBucket(fn.cx)}-fg`, text: String(fn.cx) }));
  wrap.appendChild(meta);

  const key = fnKey(fn);
  const fanIn = STATE.fanIn.get(key) || 0;
  const fanOut = STATE.fanOut.get(key) || 0;
  const badges = el('div', { cls: 'trace-badge-row' });
  badges.appendChild(el('span', { cls: 'trace-badge', title: 'Number of functions that call this one.', text: `← ${fanIn} callers` }));
  badges.appendChild(el('span', { cls: 'trace-badge', title: 'Number of distinct in-codebase functions this one calls.', text: `→ ${fanOut} calls` }));
  if (selected.extCount) {
    badges.appendChild(el('span', { cls: 'trace-badge', title: `External / library calls: ${selected.extNames.join(', ')}${selected.extCount > selected.extNames.length ? ', …' : ''}`, text: `+${selected.extCount} ext` }));
  }
  wrap.appendChild(badges);

  const callers = STATE.callersByFn.get(key) || [];
  if (callers.length) {
    wrap.appendChild(el('div', { cls: 'trace-section-label small', text: 'Callers' }));
    const row = el('div', { cls: 'trace-pill-row' });
    for (const c of callers.slice(0, 8)) {
      const callerFn = STATE.fnByKey.get(c.from);
      if (!callerFn) continue;
      row.appendChild(el('button', {
        cls: `pill in conf-${c.confidence}`,
        type: 'button',
        text: `← ${callerFn.name}`,
        title: `${callerFn.file} · L${callerFn.lineNum}`,
        on: { click: () => jumpTo(callerFn, onChange) },
      }));
    }
    if (callers.length > 8) row.appendChild(el('span', { cls: 'trace-entry-more', text: `+${callers.length - 8} more` }));
    wrap.appendChild(row);
  }

  wrap.appendChild(el('div', { cls: 'trace-section-label small', text: 'File' }));
  wrap.appendChild(el('button', {
    cls: 'trace-file-link', type: 'button', text: fn.file,
    on: { click: () => { selectPath(fn.file); onChange(); } },
  }));
  return wrap;
}

function collectHotspots(tree) {
  const seen = new Set();
  const out = [];
  function walk(n) {
    const k = fnKey(n.fn);
    if (seen.has(k)) return;
    seen.add(k);
    if (n.fn.cx >= 7) out.push(n.fn);
    for (const c of n.children) walk(c);
  }
  walk(tree);
  out.sort((a, b) => b.cx - a.cx);
  return out;
}
