import { STATE, selectPath, setFileTraceRoot, gotoFileTraceHistory } from '../state.js';
import { el, basename, alpha } from '../dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COL_W = 260;
const ROW_H = 64;
const NODE_W = 220;
const NODE_H = 48;
const PAD = 24;
const MAX_DEPTH = 5;

export function renderGraphView(onChange) {
  if (!STATE.files.length) return splash();

  const focusPath = currentRoot();
  if (!focusPath) return pickPrompt();
  const focusFile = STATE.byPath.get(focusPath);
  if (!focusFile) return pickPrompt();

  const wrap = el('div', { cls: 'graph-root' });
  wrap.appendChild(breadcrumbs(onChange));
  wrap.appendChild(el('div', {
    cls: 'view-hint',
    text: 'A file trace: pick a file in the sidebar (or double-click a node) to re-root. Arrows point from a file to the files it imports. The right panel lists files that import this one.',
  }));

  const tree = buildFileTree(focusPath);
  wrap.appendChild(hint(focusFile, tree));

  const stage = el('div', { cls: 'graph-stage' });
  stage.appendChild(graphHost(tree, onChange));
  stage.appendChild(infoPane(focusFile, onChange));
  wrap.appendChild(stage);
  return wrap;
}

function currentRoot() {
  const r = STATE.fileTraceRoot;
  if (r && STATE.byPath.has(r)) return r;
  if (STATE.selectedPath && STATE.byPath.has(STATE.selectedPath)) return STATE.selectedPath;
  return STATE.files[0]?.path || null;
}

function buildFileTree(rootPath) {
  const visited = new Set();
  function expand(path, depth) {
    const file = STATE.byPath.get(path);
    const node = {
      path, file,
      children: [], cycle: false, extCount: 0, extNames: [],
      reach: 1, depth: 0,
    };
    if (visited.has(path)) { node.cycle = true; return node; }
    visited.add(path);
    if (depth >= MAX_DEPTH) return node;

    const imports = STATE.fileImports.get(path);
    if (!imports || !imports.size) {
      // surface unresolved external libs as collapsed leaves
      const ext = (file?.imports || []).map(i => i.lib);
      node.extCount = ext.length;
      node.extNames = ext.slice(0, 6);
      return node;
    }
    const sorted = [...imports].sort();
    for (const childPath of sorted) {
      const child = expand(childPath, depth + 1);
      node.children.push(child);
      node.reach += child.reach;
      node.depth = Math.max(node.depth, 1 + child.depth);
    }
    const ext = (file?.imports || []).map(i => i.lib);
    if (ext.length) {
      node.extCount = ext.length;
      node.extNames = ext.slice(0, 6);
    }
    return node;
  }
  return expand(rootPath, 0);
}

function graphHost(tree, onChange) {
  const host = el('div', { cls: 'graph-host file-trace-host' });
  if (!tree) return host;
  const { items, edges } = layout(tree);
  const cols = items.reduce((m, n) => Math.max(m, n.col), 0) + 1;
  const rows = items.reduce((m, n) => Math.max(m, n.row), 0) + 1;
  const w = cols * COL_W + PAD * 2;
  const h = rows * ROW_H + PAD * 2;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'trace-svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  svg.style.width = `${w}px`;
  svg.style.height = `${h}px`;

  const defs = document.createElementNS(SVG_NS, 'defs');
  const m = document.createElementNS(SVG_NS, 'marker');
  m.setAttribute('id', 'farrow');
  m.setAttribute('viewBox', '0 0 10 10');
  m.setAttribute('refX', '10'); m.setAttribute('refY', '5');
  m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7');
  m.setAttribute('orient', 'auto-start-reverse');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M0,0 L10,5 L0,10 z');
  p.setAttribute('class', 'trace-svg-arrow conf-high');
  m.appendChild(p);
  defs.appendChild(m);
  svg.appendChild(defs);

  const eg = document.createElementNS(SVG_NS, 'g');
  for (const e of edges) {
    const a = items[e.from], b = items[e.to];
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const cx = (x1 + x2) / 2;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`);
    path.setAttribute('class', 'trace-svg-edge conf-high');
    path.setAttribute('marker-end', 'url(#farrow)');
    eg.appendChild(path);
  }
  svg.appendChild(eg);

  const ng = document.createElementNS(SVG_NS, 'g');
  const focusPath = currentRoot();
  for (const n of items) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
    const cls = ['trace-svg-node', 'file-node'];
    if (n.cycle) cls.push('cycle');
    if (n.path === focusPath) cls.push('active');
    g.setAttribute('class', cls.join(' '));
    g.style.cursor = 'pointer';

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(NODE_W));
    rect.setAttribute('height', String(NODE_H));
    rect.setAttribute('rx', '6');
    if (n.file?.langColor) {
      rect.setAttribute('fill', alpha(n.file.langColor, '22'));
      rect.setAttribute('stroke', n.file.langColor);
    }
    g.appendChild(rect);

    const dirLbl = document.createElementNS(SVG_NS, 'text');
    dirLbl.setAttribute('class', 'trace-svg-file');
    dirLbl.setAttribute('x', '10');
    dirLbl.setAttribute('y', '14');
    dirLbl.textContent = truncate(dirOf(n.path), 30);
    g.appendChild(dirLbl);

    const name = document.createElementNS(SVG_NS, 'text');
    name.setAttribute('class', 'trace-svg-name');
    name.setAttribute('x', '10');
    name.setAttribute('y', '30');
    name.textContent = truncate(basename(n.path), 28);
    g.appendChild(name);

    const meta = document.createElementNS(SVG_NS, 'text');
    meta.setAttribute('class', 'trace-svg-meta');
    meta.setAttribute('x', '10');
    meta.setAttribute('y', '42');
    const parts = [];
    if (n.file) parts.push(`${n.file.lineCount}L`);
    if (n.file) parts.push(`${n.file.fns.length} fn`);
    if (n.extCount) parts.push(`+${n.extCount} ext`);
    if (n.cycle) parts.push('cycle');
    meta.textContent = parts.join(' · ');
    g.appendChild(meta);

    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent =
      `${n.path}\n` +
      (n.file ? `${n.file.lang} · ${n.file.lineCount} lines · ${n.file.fns.length} functions\n` : '') +
      (n.extCount ? `external imports (${n.extCount}): ${n.extNames.join(', ')}${n.extCount > n.extNames.length ? ', …' : ''}\n` : '') +
      `click: select · double-click: re-root trace`;
    g.appendChild(title);

    g.addEventListener('click', () => { selectPath(n.path); onChange(); });
    g.addEventListener('dblclick', () => { setFileTraceRoot(n.path); selectPath(n.path); onChange(); });
    ng.appendChild(g);
  }
  svg.appendChild(ng);
  host.appendChild(svg);
  return host;
}

function layout(tree) {
  const items = [];
  const edges = [];
  const queue = [{ node: tree, col: 0, parentIdx: -1 }];
  const rowsAtCol = new Map();
  while (queue.length) {
    const { node, col, parentIdx } = queue.shift();
    const row = rowsAtCol.get(col) || 0;
    rowsAtCol.set(col, row + 1);
    const idx = items.length;
    items.push({
      path: node.path,
      file: node.file,
      col, row,
      x: PAD + col * COL_W,
      y: PAD + row * ROW_H,
      extCount: node.extCount || 0,
      extNames: node.extNames || [],
      cycle: !!node.cycle,
    });
    if (parentIdx >= 0) edges.push({ from: parentIdx, to: idx });
    for (const child of node.children) queue.push({ node: child, col: col + 1, parentIdx: idx });
  }
  return { items, edges };
}

function infoPane(focusFile, onChange) {
  const info = el('aside', { cls: 'graph-info' });
  info.appendChild(el('div', { cls: 'graph-info-title', text: basename(focusFile.path) }));
  info.appendChild(el('div', { cls: 'graph-info-sub', text: focusFile.path }));

  const importers = [...(STATE.fileImporters.get(focusFile.path) || new Set())].sort();
  const sec1 = el('div', { cls: 'graph-info-sec' });
  sec1.appendChild(el('div', { cls: 'graph-info-sec-title', text: `Imported by (${importers.length})` }));
  if (!importers.length) {
    sec1.appendChild(el('div', { cls: 'graph-info-empty-sm', text: 'no in-codebase importers' }));
  } else {
    for (const p of importers) sec1.appendChild(connRow(p, onChange));
  }
  info.appendChild(sec1);

  const exts = focusFile.imports || [];
  const sec2 = el('div', { cls: 'graph-info-sec' });
  sec2.appendChild(el('div', { cls: 'graph-info-sec-title', text: `External imports (${exts.length})` }));
  if (!exts.length) {
    sec2.appendChild(el('div', { cls: 'graph-info-empty-sm', text: 'none' }));
  } else {
    const row = el('div', { cls: 'trace-pill-row' });
    for (const im of exts) row.appendChild(el('span', { cls: 'pill', text: im.lib }));
    sec2.appendChild(row);
  }
  info.appendChild(sec2);

  return info;
}

function connRow(otherPath, onChange) {
  const row = el('button', {
    cls: 'graph-conn', type: 'button',
    title: otherPath + '\nclick: re-root trace on this file',
    on: { click: () => { setFileTraceRoot(otherPath); selectPath(otherPath); onChange(); } },
  });
  row.appendChild(el('span', { cls: 'graph-conn-name', text: basename(otherPath) }));
  row.appendChild(el('span', { cls: 'graph-conn-tag', text: dirOf(otherPath) || '/' }));
  return row;
}

function breadcrumbs(onChange) {
  const strip = el('div', { cls: 'trace-crumbs' });
  const history = STATE.fileTraceHistory;
  const idx = STATE.fileTraceHistoryIdx;
  if (!history.length) return strip;

  strip.appendChild(el('button', {
    cls: 'crumb-nav', type: 'button', text: '←',
    title: 'Back',
    disabled: idx <= 0,
    on: { click: () => { gotoFileTraceHistory(idx - 1); onChange(); } },
  }));
  strip.appendChild(el('button', {
    cls: 'crumb-nav', type: 'button', text: '→',
    title: 'Forward',
    disabled: idx >= history.length - 1,
    on: { click: () => { gotoFileTraceHistory(idx + 1); onChange(); } },
  }));

  const trail = el('div', { cls: 'crumb-trail' });
  for (let i = 0; i < history.length; i++) {
    const path = history[i];
    const isCurrent = i === idx;
    if (i > 0) trail.appendChild(el('span', { cls: 'crumb-sep', text: '›' }));
    trail.appendChild(el('button', {
      cls: `crumb${isCurrent ? ' current' : ''}${i === 0 ? ' origin' : ''}`,
      type: 'button',
      title: path,
      text: basename(path),
      on: { click: () => { gotoFileTraceHistory(i); onChange(); } },
    }));
  }
  strip.appendChild(trail);
  return strip;
}

function hint(focusFile, tree) {
  const reach = tree.reach;
  const depth = tree.depth;
  const text = `${focusFile.path} imports ${reach - 1} file${reach - 1 === 1 ? '' : 's'} transitively, max chain depth ${depth}.`;
  return el('div', { cls: 'view-hint', text });
}

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-icon', text: '🕸️' }),
    el('div', { cls: 'splash-title', text: 'No graph yet' }),
    el('div', { cls: 'splash-sub', text: 'Drop a folder to see how files import each other.' }),
  ]);
}

function pickPrompt() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-title', text: 'Pick a file' }),
    el('div', { cls: 'splash-sub', text: 'Click a file in the sidebar to trace its file-level dependencies.' }),
  ]);
}
