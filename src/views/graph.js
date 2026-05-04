import { STATE, selectPath, setFileTraceRoot, gotoFileTraceHistory, toggleGraphDir, resetGraphView } from '../state.js';
import { el, basename, alpha } from '../dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderGraphView(onChange) {
  if (!STATE.files.length) return splash();

  const focusPath = currentRoot();
  const focusFile = focusPath ? STATE.byPath.get(focusPath) : null;

  const wrap = el('div', { cls: 'graph-root' });
  wrap.appendChild(breadcrumbs(onChange));
  wrap.appendChild(el('div', { cls: 'view-hint' }, [
    el('span', { cls: 'view-hint-name', text: 'Graph' }),
    el('span', { text: ' — Whole-repo file map. Each node is a file; arrows point from a file to the files it imports. Click a node to focus, double-click to re-root the file trace.' }),
  ]));
  wrap.appendChild(legend(onChange));
  wrap.appendChild(dirToggleBar(onChange));

  const stage = el('div', { cls: 'graph-stage' });
  stage.appendChild(graphCanvas(focusPath, onChange));
  stage.appendChild(infoPane(focusFile, onChange));
  wrap.appendChild(stage);
  return wrap;
}

function legend(onChange) {
  const wrap = el('div', { cls: 'graph-legend' });
  const importEdges = countImportEdges();
  wrap.appendChild(el('span', {
    cls: 'graph-legend-stat',
    text: `${STATE.files.length} files · ${importEdges} import edges`,
  }));
  wrap.appendChild(el('span', { cls: 'graph-legend-sep', text: '·' }));
  wrap.appendChild(legendSwatch('var(--accent)', 'imports →'));
  wrap.appendChild(legendSwatch('var(--success)', 'imported by ←'));
  wrap.appendChild(el('span', { cls: 'graph-legend-hint', text: 'scroll = zoom · drag = pan' }));
  wrap.appendChild(el('button', {
    cls: 'graph-fit-btn', type: 'button', text: 'Fit',
    title: 'Reset zoom and recenter',
    on: { click: () => { resetGraphView(); onChange(); } },
  }));
  return wrap;
}

function dirToggleBar(onChange) {
  const dirs = topLevelDirs();
  const wrap = el('div', { cls: 'graph-dir-toggles' });
  if (!dirs.length) return wrap;
  wrap.appendChild(el('span', { cls: 'graph-dir-toggle-label', text: 'Folders:' }));
  for (const d of dirs) {
    const collapsed = STATE.collapsedGraphDirs.has(d.name);
    wrap.appendChild(el('button', {
      cls: `graph-dir-chip${collapsed ? ' collapsed' : ''}`,
      type: 'button',
      title: collapsed ? `Expand ${d.name}/` : `Collapse ${d.name}/ into one node`,
      text: `${collapsed ? '▸' : '▾'} ${d.name}/ · ${d.count}`,
      on: { click: () => { toggleGraphDir(d.name); onChange(); } },
    }));
  }
  return wrap;
}

function topLevelDirs() {
  const m = new Map();
  for (const f of STATE.files) {
    const d = topDir(f.path);
    if (!d) continue;
    m.set(d, (m.get(d) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function topDir(p) {
  const i = p.indexOf('/');
  return i < 0 ? '' : p.slice(0, i);
}

function legendSwatch(color, label) {
  const w = el('span', { cls: 'graph-legend-swatch-row' });
  w.appendChild(el('span', { cls: 'graph-legend-swatch', style: { background: color } }));
  w.appendChild(el('span', { cls: 'graph-legend-label', text: label }));
  return w;
}

function countImportEdges() {
  let n = 0;
  for (const [, set] of STATE.fileImports) n += set.size;
  return n;
}

function currentRoot() {
  const r = STATE.fileTraceRoot;
  if (r && STATE.byPath.has(r)) return r;
  if (STATE.selectedPath && STATE.byPath.has(STATE.selectedPath)) return STATE.selectedPath;
  return STATE.files[0]?.path || null;
}

function graphCanvas(focusPath, onChange) {
  const host = el('div', { cls: 'graph-host' });
  const files = STATE.files;
  if (!files.length) return host;

  const collapsed = STATE.collapsedGraphDirs || new Set();
  const clusterIdFor = p => {
    const d = topDir(p);
    return d && collapsed.has(d) ? `__dir__:${d}` : p;
  };

  // Build cluster nodes — each is either a single file or a collapsed-dir
  // super-node aggregating all files under that top-level folder.
  const nodes = new Map();
  for (const f of files) {
    const id = clusterIdFor(f.path);
    if (id.startsWith('__dir__:')) {
      let n = nodes.get(id);
      if (!n) {
        nodes.set(id, n = { id, kind: 'dir', dir: id.slice(8), files: [], lineCount: 0, langColor: f.langColor });
      }
      n.files.push(f);
      n.lineCount += f.lineCount || 0;
    } else {
      nodes.set(id, { id, kind: 'file', file: f, files: [f], lineCount: f.lineCount, langColor: f.langColor });
    }
  }

  // Edges between cluster IDs (intra-cluster edges hidden).
  const outgoing = new Map();
  const incoming = new Map();
  for (const id of nodes.keys()) { outgoing.set(id, new Set()); incoming.set(id, new Set()); }
  for (const [from, set] of STATE.fileImports) {
    const fId = clusterIdFor(from);
    if (!nodes.has(fId)) continue;
    for (const to of set) {
      const tId = clusterIdFor(to);
      if (!nodes.has(tId) || fId === tId) continue;
      outgoing.get(fId).add(tId);
      incoming.get(tId).add(fId);
    }
  }

  // Pull files with no edges into their own "isolated" row so they don't
  // crowd the entry-point layer.
  const orderedIds = [...nodes.keys()].sort();
  const wiredIds = [];
  const isolatedIds = [];
  for (const id of orderedIds) {
    if (outgoing.get(id).size === 0 && incoming.get(id).size === 0) isolatedIds.push(id);
    else wiredIds.push(id);
  }

  const layers = computeLayers(wiredIds, outgoing, incoming);
  const buckets = [];
  for (const id of wiredIds) {
    const L = layers.get(id) || 0;
    if (!buckets[L]) buckets[L] = [];
    buckets[L].push(id);
  }
  for (const b of buckets) if (b) b.sort();
  if (isolatedIds.length) buckets.push(isolatedIds.sort());

  const numLayers = buckets.length || 1;
  const widest = buckets.reduce((m, b) => Math.max(m, b ? b.length : 0), 1);
  const W = Math.max(900, widest * 160);
  const H = Math.max(560, numLayers * 150);
  const padX = 80, padY = 70;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const positions = new Map();
  buckets.forEach((bucket, L) => {
    if (!bucket) return;
    const rowY = numLayers === 1 ? H / 2 : padY + (L / (numLayers - 1)) * innerH;
    bucket.forEach((id, i) => {
      const colX = bucket.length === 1
        ? W / 2
        : padX + (i / (bucket.length - 1)) * innerW;
      const node = nodes.get(id);
      const r = node.kind === 'dir'
        ? 16 + Math.sqrt(node.lineCount / 25)
        : 6 + Math.sqrt((node.lineCount || 0) / 18);
      positions.set(id, { x: colX, y: rowY, r, node });
    });
  });

  const focusId = focusPath ? clusterIdFor(focusPath) : null;
  const focusOut = focusId ? (outgoing.get(focusId) || new Set()) : null;
  const focusIn = focusId ? (incoming.get(focusId) || new Set()) : null;
  const focused = focusId ? new Set([focusId, ...(focusOut || []), ...(focusIn || [])]) : null;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'graph-svg');
  const initView = STATE.graphView || { x: 0, y: 0, w: W, h: H };
  svg.setAttribute('viewBox', `${initView.x} ${initView.y} ${initView.w} ${initView.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.cursor = 'grab';

  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.appendChild(arrowMarker('garrow-out', 'var(--accent)'));
  defs.appendChild(arrowMarker('garrow-in', 'var(--success)'));
  defs.appendChild(arrowMarker('garrow-dim', 'rgba(120,118,111,0.35)'));
  svg.appendChild(defs);

  // Edges
  const eg = document.createElementNS(SVG_NS, 'g');
  eg.setAttribute('class', 'graph-edges');
  for (const [from, set] of outgoing) {
    const a = positions.get(from);
    if (!a) continue;
    for (const to of set) {
      const b = positions.get(to);
      if (!b) continue;
      const isOut = focusId && from === focusId;
      const isIn = focusId && to === focusId;
      const dim = focusId && !isOut && !isIn;
      const cls = isOut ? 'edge-out' : isIn ? 'edge-in' : (dim ? 'edge-dim' : 'edge-base');
      const marker = isOut ? 'url(#garrow-out)' : isIn ? 'url(#garrow-in)' : 'url(#garrow-dim)';
      const path = document.createElementNS(SVG_NS, 'path');
      const dy = b.y - a.y;
      const handle = Math.max(40, Math.abs(dy) * 0.5);
      path.setAttribute('d', `M${a.x},${a.y} C${a.x},${a.y + handle} ${b.x},${b.y - handle} ${b.x},${b.y}`);
      path.setAttribute('class', `graph-edge ${cls}`);
      path.setAttribute('marker-end', marker);
      eg.appendChild(path);
    }
  }
  svg.appendChild(eg);

  // Nodes
  const ng = document.createElementNS(SVG_NS, 'g');
  ng.setAttribute('class', 'graph-nodes');
  for (const [id, pos] of positions) {
    const node = pos.node;
    const dimmed = focused && !focused.has(id);
    const isFocus = id === focusId;
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
    g.setAttribute('class', `graph-node graph-node-${node.kind}${isFocus ? ' focus' : ''}${dimmed ? ' dim' : ''}`);
    g.style.cursor = 'pointer';

    if (node.kind === 'dir') {
      const w = Math.max(120, pos.r * 6), h = Math.max(48, pos.r * 2.6);
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(-w / 2)); rect.setAttribute('y', String(-h / 2));
      rect.setAttribute('width', String(w)); rect.setAttribute('height', String(h));
      rect.setAttribute('rx', '8');
      rect.setAttribute('fill', alpha(node.langColor || '#888', '33'));
      rect.setAttribute('stroke', isFocus ? 'var(--accent)' : (node.langColor || '#888'));
      rect.setAttribute('stroke-width', isFocus ? '2.5' : '1.5');
      rect.setAttribute('stroke-dasharray', '4,3');
      g.appendChild(rect);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'graph-node-label graph-dir-label');
      label.setAttribute('x', '0'); label.setAttribute('y', '-2');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = `▸ ${node.dir}/`;
      g.appendChild(label);
      const sub = document.createElementNS(SVG_NS, 'text');
      sub.setAttribute('class', 'graph-node-sublabel');
      sub.setAttribute('x', '0'); sub.setAttribute('y', '14');
      sub.setAttribute('text-anchor', 'middle');
      sub.textContent = `${node.files.length} files · click to expand`;
      g.appendChild(sub);
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${node.dir}/ (collapsed)\n${node.files.length} files · ${node.lineCount} lines\nimports ${outgoing.get(id).size} · imported by ${incoming.get(id).size}`;
      g.appendChild(title);
      g.addEventListener('click', (e) => { e.stopPropagation(); toggleGraphDir(node.dir); onChange(); });
    } else {
      const f = node.file;
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('r', String(pos.r));
      circle.setAttribute('fill', f.langColor ? alpha(f.langColor, 'cc') : '#888');
      circle.setAttribute('stroke', isFocus ? 'var(--accent)' : (f.langColor || '#888'));
      circle.setAttribute('stroke-width', isFocus ? '2.5' : '1');
      g.appendChild(circle);
      const showLabel = isFocus || (focused && focused.has(id)) || pos.r > 8 || nodes.size <= 60;
      if (showLabel) {
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', 'graph-node-label');
        label.setAttribute('x', '0');
        label.setAttribute('y', String(pos.r + 12));
        label.setAttribute('text-anchor', 'middle');
        label.textContent = truncate(basename(f.path), 22);
        g.appendChild(label);
      }
      const title = document.createElementNS(SVG_NS, 'title');
      const outN = outgoing.get(id).size, inN = incoming.get(id).size;
      title.textContent = `${f.path}\n${f.lang} · ${f.lineCount} lines · ${f.fns.length} fns\nimports ${outN} · imported by ${inN}\nclick: focus · double-click: open in trace`;
      g.appendChild(title);
      g.addEventListener('click', (e) => { e.stopPropagation(); selectPath(f.path); setFileTraceRoot(f.path); onChange(); });
      g.addEventListener('dblclick', (e) => { e.stopPropagation(); setFileTraceRoot(f.path); selectPath(f.path); onChange(); });
    }
    ng.appendChild(g);
  }
  svg.appendChild(ng);

  attachPanZoom(svg, W, H);

  host.appendChild(svg);
  return host;
}

function attachPanZoom(svg, W, H) {
  const getView = () => {
    const v = svg.viewBox.baseVal;
    return { x: v.x, y: v.y, w: v.width, h: v.height };
  };
  const setView = (v) => {
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    STATE.graphView = v;
  };
  const minW = W * 0.05, maxW = W * 6;
  const minH = H * 0.05, maxH = H * 6;

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const view = getView();
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const cx = view.x + px * view.w;
    const cy = view.y + py * view.h;
    const factor = Math.exp(e.deltaY * 0.0015);
    const nw = Math.max(minW, Math.min(maxW, view.w * factor));
    const nh = Math.max(minH, Math.min(maxH, view.h * factor));
    setView({ x: cx - px * nw, y: cy - py * nh, w: nw, h: nh });
  }, { passive: false });

  let dragging = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.graph-node')) return;
    dragging = { x: e.clientX, y: e.clientY, view: getView() };
    svg.setPointerCapture(e.pointerId);
    svg.style.cursor = 'grabbing';
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - dragging.x) / rect.width * dragging.view.w;
    const dy = (e.clientY - dragging.y) / rect.height * dragging.view.h;
    setView({ x: dragging.view.x - dx, y: dragging.view.y - dy, w: dragging.view.w, h: dragging.view.h });
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = null;
    try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
    svg.style.cursor = 'grab';
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
}

function computeLayers(ids, outgoing, incoming) {
  // Kahn's algorithm. A node's layer = max layer of any node that points to
  // it, plus one. Nodes with no incoming edges (entry points) sit at layer 0;
  // their dependencies cascade downward. Cycle nodes never reach in-degree 0,
  // so we park them in an overflow layer below the deepest resolved node.
  const layer = new Map();
  const remaining = new Map();
  for (const id of ids) remaining.set(id, (incoming.get(id) || new Set()).size);
  const queue = [];
  for (const id of ids) if (remaining.get(id) === 0) { layer.set(id, 0); queue.push(id); }
  while (queue.length) {
    const u = queue.shift();
    const uL = layer.get(u);
    for (const v of outgoing.get(u) || []) {
      const candidate = uL + 1;
      if (candidate > (layer.get(v) ?? -1)) layer.set(v, candidate);
      remaining.set(v, remaining.get(v) - 1);
      if (remaining.get(v) === 0) queue.push(v);
    }
  }
  let maxL = 0;
  for (const l of layer.values()) if (l > maxL) maxL = l;
  for (const id of ids) if (!layer.has(id)) layer.set(id, maxL + 1);
  return layer;
}

function arrowMarker(id, color) {
  const m = document.createElementNS(SVG_NS, 'marker');
  m.setAttribute('id', id);
  m.setAttribute('viewBox', '0 0 10 10');
  m.setAttribute('refX', '9'); m.setAttribute('refY', '5');
  m.setAttribute('markerWidth', '6'); m.setAttribute('markerHeight', '6');
  m.setAttribute('orient', 'auto-start-reverse');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M0,0 L10,5 L0,10 z');
  p.setAttribute('fill', color);
  m.appendChild(p);
  return m;
}

function infoPane(focusFile, onChange) {
  const info = el('aside', { cls: 'graph-info' });
  if (!focusFile) {
    info.appendChild(el('div', { cls: 'graph-info-empty', text: 'Click a node to see its imports.' }));
    return info;
  }
  info.appendChild(el('div', { cls: 'graph-info-title', text: basename(focusFile.path) }));
  info.appendChild(el('div', { cls: 'graph-info-sub', text: focusFile.path }));

  const importsOut = [...(STATE.fileImports.get(focusFile.path) || new Set())].sort();
  const importers = [...(STATE.fileImporters.get(focusFile.path) || new Set())].sort();

  const sec1 = el('div', { cls: 'graph-info-sec' });
  sec1.appendChild(el('div', { cls: 'graph-info-sec-title', text: `Imports (${importsOut.length}) →` }));
  if (!importsOut.length) sec1.appendChild(el('div', { cls: 'graph-info-empty-sm', text: 'no in-codebase imports' }));
  else for (const p of importsOut) sec1.appendChild(connRow(p, 'out', onChange));
  info.appendChild(sec1);

  const sec2 = el('div', { cls: 'graph-info-sec' });
  sec2.appendChild(el('div', { cls: 'graph-info-sec-title', text: `← Imported by (${importers.length})` }));
  if (!importers.length) sec2.appendChild(el('div', { cls: 'graph-info-empty-sm', text: 'no in-codebase importers' }));
  else for (const p of importers) sec2.appendChild(connRow(p, 'in', onChange));
  info.appendChild(sec2);

  const exts = focusFile.imports || [];
  const sec3 = el('div', { cls: 'graph-info-sec' });
  sec3.appendChild(el('div', { cls: 'graph-info-sec-title', text: `External libs (${exts.length})` }));
  if (!exts.length) sec3.appendChild(el('div', { cls: 'graph-info-empty-sm', text: 'none' }));
  else {
    const row = el('div', { cls: 'trace-pill-row' });
    for (const im of exts) row.appendChild(el('span', { cls: 'pill', text: im.lib }));
    sec3.appendChild(row);
  }
  info.appendChild(sec3);

  return info;
}

function connRow(otherPath, dir, onChange) {
  const row = el('button', {
    cls: `graph-conn graph-conn-${dir}`, type: 'button',
    title: otherPath + '\nclick: focus this file',
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
