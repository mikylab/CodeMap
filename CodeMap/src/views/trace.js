import { STATE, setTraceRoot, selectPath } from '../state.js';
import { cxBucket } from '../tabs.js';
import { buildTraceTree, fnKey, isEntryPoint, pickEntryForFile } from '../trace-graph.js';
import { el, basename } from '../dom.js';
import { renderTraceMap } from './trace-graph-view.js';

let selectedKey = null;

export function renderTrace(onChange) {
  if (!STATE.files.length) return splash();

  const file = currentFile();
  if (!file) return splash();

  const root = currentRoot(file);
  if (!root) return emptyFile(file);

  if (selectedKey == null || !STATE.fnByKey.get(selectedKey)) selectedKey = fnKey(root);

  const tree = buildTraceTree(root, STATE.callsByFn, STATE.fnByKey);

  const wrap = el('div', { cls: 'trace-root' });
  wrap.appendChild(hint(file, root, tree));
  wrap.appendChild(controls(file, root, onChange));
  wrap.appendChild(body(tree, root, onChange));
  return wrap;
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-title', text: 'Drop a folder to begin' }),
    el('div', { cls: 'splash-sub', text: 'Trace shows the execution map for the file you select in the sidebar.' }),
  ]);
}

function emptyFile(file) {
  const wrap = el('div', { cls: 'trace-root' });
  wrap.appendChild(el('div', { cls: 'view-hint', text: `${file.path} has no detected functions to trace.` }));
  return wrap;
}

function currentFile() {
  if (STATE.selectedPath && STATE.byPath.has(STATE.selectedPath)) {
    return STATE.byPath.get(STATE.selectedPath);
  }
  return STATE.files[0] || null;
}

function currentRoot(file) {
  const r = STATE.traceRoot;
  if (r) {
    const hit = file.fns.find(fn => fn.name === r.name && fn.lineNum === r.lineNum && fn.file === r.file);
    if (hit) return hit;
  }
  return pickEntryForFile(file, STATE.callsByFn, STATE.callersByFn, STATE.fnByKey)
    || file.fns[0]
    || null;
}

function hint(file, root, tree) {
  const reach = tree.subtree.reach;
  const depth = tree.subtree.depth;
  const filesTouched = tree.subtree.files.size;
  const hotspots = tree.subtree.hotspots;
  const text = `${file.path} → starting at ${root.name}(): execution touches ${reach} function${reach === 1 ? '' : 's'} across ${filesTouched} file${filesTouched === 1 ? '' : 's'}, max chain depth ${depth}, ${hotspots} complexity hotspot${hotspots === 1 ? '' : 's'}.`;
  return el('div', { cls: 'view-hint', text });
}

function controls(file, root, onChange) {
  const strip = el('div', { cls: 'trace-controls' });

  const fileBlock = el('div', { cls: 'trace-control-block' });
  fileBlock.appendChild(el('span', { cls: 'trace-ctrl-label', text: 'File' }));
  const fileSel = el('select', {
    cls: 'trace-select',
    on: {
      change: e => {
        selectPath(e.target.value);
        selectedKey = null;
        onChange();
      },
    },
  });
  for (const f of STATE.files) {
    const opt = el('option', { value: f.path, text: f.path });
    if (f.path === file.path) opt.selected = true;
    fileSel.appendChild(opt);
  }
  fileBlock.appendChild(fileSel);
  strip.appendChild(fileBlock);

  const entries = file.fns.filter(fn => isEntryPoint(fn, STATE.callersByFn));
  const entryPool = entries.length ? entries : file.fns;

  const entryBlock = el('div', { cls: 'trace-control-block' });
  entryBlock.appendChild(el('span', { cls: 'trace-ctrl-label', text: entries.length ? `Entry (${entries.length})` : 'Function' }));
  const chips = el('div', { cls: 'trace-entry-chips' });
  for (const fn of entryPool.slice(0, 12)) {
    const isActive = fnKey(fn) === fnKey(root);
    chips.appendChild(el('button', {
      cls: `trace-entry-chip${isActive ? ' active' : ''}`,
      type: 'button',
      text: `${fn.name}()`,
      title: `line ${fn.lineNum} · cx:${fn.cx}`,
      on: {
        click: () => {
          setTraceRoot(fn);
          selectedKey = fnKey(fn);
          onChange();
        },
      },
    }));
  }
  if (entryPool.length > 12) {
    chips.appendChild(el('span', { cls: 'trace-entry-more', text: `+${entryPool.length - 12} more` }));
  }
  entryBlock.appendChild(chips);
  strip.appendChild(entryBlock);

  return strip;
}

function body(tree, root, onChange) {
  const wrap = el('div', { cls: 'trace-body map-mode' });
  const selectedNode = findNode(tree, selectedKey) || tree;
  wrap.appendChild(renderTraceMap(tree, selectedNode, key => {
    selectedKey = key;
    onChange();
  }, fn => {
    setTraceRoot(fn);
    selectPath(fn.file);
    selectedKey = fnKey(fn);
    onChange();
  }));
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

  // Maintainability summary for the whole map
  pane.appendChild(el('div', { cls: 'trace-section-label', text: 'Map summary' }));
  pane.appendChild(summary(tree));

  // Hotspot list
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
        on: {
          click: () => {
            setTraceRoot(fn);
            selectPath(fn.file);
            selectedKey = fnKey(fn);
            onChange();
          },
        },
      }));
    }
    pane.appendChild(list);
  }

  // Selected node detail
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

  // Callers (jump-to)
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
        on: {
          click: () => {
            setTraceRoot(callerFn);
            selectPath(callerFn.file);
            selectedKey = fnKey(callerFn);
            onChange();
          },
        },
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
