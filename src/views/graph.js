import { STATE, selectFile, gotoFileTraceHistory, toggleGraphDir, resetGraphView, zoomGraph, setGraphFilter, toggleGraphHideIsolated, clearGraphFocus, resetGraphCollapse, topClusterMap, setPaintEndpoint, exitFullscreen, pushHistory, captureSnapshot } from '../state.js';
import { el, basename, alpha } from '../dom.js';
import { renderPaintStrip, computePaint } from './paint-strip.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Folders are containers, not language artifacts — paint every collapsed folder
// box one neutral violet so it reads as a folder regardless of the dominant
// language inside, and never blends in with blue-tinted source files (which keep
// their per-language colors).
const DIR_COLOR = '#8b7fd1';
// A single bright highlight reserved for the selected/focused node — distinct
// from every language hue and from the folder violet, so the current selection
// is unmistakable in a crowded map.
const SELECT_FILL = '#ffb02e';
const SELECT_STROKE = '#c77d00';

export function renderGraphView(onChange) {
  if (!STATE.files.length) return splash();

  const focusPath = currentRoot();
  const focusFile = focusPath ? STATE.byPath.get(focusPath) : null;

  const wrap = el('div', { cls: 'graph-root' });
  const strip = renderPaintStrip(onChange);
  if (strip) wrap.appendChild(strip);
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
  wrap.appendChild(legendSwatch(DIR_COLOR, 'folder'));
  wrap.appendChild(legendSwatch(SELECT_FILL, 'selected'));

  const search = el('input', {
    cls: 'graph-search',
    type: 'search',
    placeholder: 'Filter files…',
    value: STATE.graphFilter,
    title: 'Highlight files whose path matches',
  });
  search.addEventListener('input', () => {
    setGraphFilter(search.value);
    onChange();
    // onChange() rebuilds the toolbar DOM, which steals focus. Restore it on
    // the freshly-mounted input so typing isn't interrupted.
    requestAnimationFrame(() => {
      const next = document.querySelector('.graph-search');
      if (next) { next.focus(); next.setSelectionRange(search.value.length, search.value.length); }
    });
  });
  wrap.appendChild(search);

  wrap.appendChild(el('button', {
    cls: `graph-toggle-btn${STATE.graphHideIsolated ? ' active' : ''}`,
    type: 'button',
    text: STATE.graphHideIsolated ? 'Show isolated' : 'Hide isolated',
    title: 'Toggle visibility of files with no in-codebase imports',
    on: { click: () => { toggleGraphHideIsolated(); onChange(); } },
  }));

  const zoom = el('div', { cls: 'graph-zoom-group' });
  zoom.appendChild(el('button', {
    cls: 'graph-zoom-btn', type: 'button', text: '−',
    title: 'Zoom out',
    on: { click: () => { zoomGraph(1.25); onChange(); } },
  }));
  zoom.appendChild(el('button', {
    cls: 'graph-zoom-btn', type: 'button', text: '+',
    title: 'Zoom in',
    on: { click: () => { zoomGraph(0.8); onChange(); } },
  }));
  zoom.appendChild(el('button', {
    cls: 'graph-fit-btn', type: 'button', text: 'Fit',
    title: 'Reset zoom and recenter',
    on: { click: () => { resetGraphView(); onChange(); } },
  }));
  // The true-fullscreen toggle lives in the overlay header (the conventional,
  // discoverable spot) — see views/fullscreen.js.
  wrap.appendChild(zoom);
  return wrap;
}

function dirToggleBar(onChange) {
  const dirs = topLevelDirs();
  const wrap = el('div', { cls: 'graph-dir-toggles' });
  if (!dirs.length) return wrap;
  wrap.appendChild(el('span', { cls: 'graph-dir-toggle-label', text: 'Folders:' }));
  wrap.appendChild(el('button', {
    cls: 'graph-dir-chip graph-dir-reset',
    type: 'button',
    title: 'Restore the default folder collapse state',
    text: '↺ Reset',
    on: { click: () => { resetGraphCollapse(); onChange(); } },
  }));
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
  return [...topClusterMap(STATE.files).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
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
  // Prefer the user's explicit selection — fall back to the file-trace root
  // (set on initial load) only when nothing is selected.
  if (STATE.selectedPath && STATE.byPath.has(STATE.selectedPath)) return STATE.selectedPath;
  const r = STATE.fileTraceRoot;
  if (r && STATE.byPath.has(r)) return r;
  return null;
}

function graphCanvas(focusPath, onChange) {
  const host = el('div', { cls: 'graph-host' });
  const files = STATE.files;
  if (!files.length) return host;

  const collapsed = STATE.collapsedGraphDirs || new Set();
  const clusterIdFor = p => {
    // Walk from the shallowest ancestor outward — the first collapsed prefix
    // wins, so a parent dir absorbs anything below it.
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join('/');
      if (collapsed.has(prefix)) return `__dir__:${prefix}`;
    }
    return p;
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
  if (isolatedIds.length && !STATE.graphHideIsolated) buckets.push(isolatedIds.sort());

  // Wrap wide layers into balanced sub-rows so a fat layer becomes a compact
  // block instead of an endless horizontal strip. This keeps the whole map near
  // the viewport's aspect ratio, so big repos need far less panning to read.
  const realLayers = buckets.filter(Boolean);
  const totalNodes = realLayers.reduce((n, b) => n + b.length, 0);
  const ROW_H = 92, LAYER_GAP = 56, COL_GAP = 34;
  const padX = 90, padY = 80;
  // Column budget grows with √(node count) so the graph stays roughly landscape;
  // capped so very wide layers wrap rather than sprawl off-screen.
  const colBudget = Math.max(6, Math.min(26, Math.round(Math.sqrt(totalNodes || 1) * 1.7)));

  const radiusFor = (node) => node.kind === 'dir'
    ? 16 + Math.sqrt(node.lineCount / 25)
    : 6 + Math.sqrt((node.lineCount || 0) / 18);

  // Split each layer into sub-rows, then pack nodes within a row by their
  // *measured* width (a folder box is as wide as its longest label, a file is
  // its label or dot). Fixed-pitch columns collided whenever a box was wider
  // than the pitch; measured packing guarantees a real gap between every box.
  const rows = []; // { y, rowW, items: [{ id, node, r, w }] }
  let cursorY = padY, maxRowW = 0, maxY = padY;
  for (const bucket of realLayers) {
    const cols = Math.min(colBudget, bucket.length);
    const subRows = Math.ceil(bucket.length / cols);
    for (let sr = 0; sr < subRows; sr++) {
      const slice = bucket.slice(sr * cols, sr * cols + cols);
      const items = slice.map(id => {
        const node = nodes.get(id);
        const r = radiusFor(node);
        return { id, node, r, w: nodeLayoutWidth(node, r, nodes.size) };
      });
      const rowW = items.reduce((s, it) => s + it.w, 0) + COL_GAP * Math.max(0, items.length - 1);
      const y = cursorY + sr * ROW_H + ROW_H / 2;
      maxRowW = Math.max(maxRowW, rowW);
      maxY = Math.max(maxY, y);
      rows.push({ y, rowW, items });
    }
    cursorY += subRows * ROW_H + LAYER_GAP;
  }

  const W = Math.max(900, padX * 2 + maxRowW);
  const H = Math.max(520, maxY + ROW_H / 2 + padY);
  const centerX = W / 2;

  const positions = new Map();
  for (const row of rows) {
    let x = centerX - row.rowW / 2;
    row.items.forEach((it, colIdx) => {
      positions.set(it.id, { x: x + it.w / 2, y: row.y, r: it.r, node: it.node, col: colIdx, w: it.w });
      x += it.w + COL_GAP;
    });
  }

  const focusId = focusPath ? clusterIdFor(focusPath) : null;
  const focusOut = focusId ? (outgoing.get(focusId) || new Set()) : null;
  const focusIn = focusId ? (incoming.get(focusId) || new Set()) : null;
  const focused = focusId ? new Set([focusId, ...(focusOut || []), ...(focusIn || [])]) : null;

  const paint = computePaint();
  const paintActive = paint.mode !== 'none' && STATE.paint.kind === 'file';
  const paintNodes = paintActive ? paint.nodes : null;

  const filter = (STATE.graphFilter || '').trim().toLowerCase();
  const matchedIds = filter
    ? new Set([...nodes.keys()].filter(id => {
        const n = nodes.get(id);
        if (n.kind === 'dir') return n.dir.toLowerCase().includes(filter);
        return n.file.path.toLowerCase().includes(filter);
      }))
    : null;

  STATE.graphSize = { W, H };

  // Files belonging to the folder the user just expanded — used to frame the
  // camera on them and pulse them so it's clear what opened and where it sits.
  const focusDir = STATE.graphFocusDir;
  const isUnderFocusDir = (node) => {
    if (!focusDir) return false;
    if (node.kind === 'file') return node.file.path.startsWith(focusDir + '/');
    return node.dir === focusDir || node.dir.startsWith(focusDir + '/');
  };

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'graph-svg');
  // Frame the content with a margin on first render (or after a structure
  // change reset graphView to null) so the map opens centered and legible
  // rather than as a microscopic dot-field inside the oversized canvas.
  if (!STATE.graphView) {
    const focusPositions = focusDir
      ? [...positions.values()].filter(p => isUnderFocusDir(p.node))
      : [];
    // After an expand, frame just the revealed files (keeps you anchored to
    // what you opened). Otherwise frame the whole map.
    STATE.graphView = focusPositions.length
      ? fitPositions(focusPositions, W, H, 1.6)
      : fitView(positions, W, H);
  }
  const initView = STATE.graphView;
  svg.setAttribute('viewBox', `${initView.x} ${initView.y} ${initView.w} ${initView.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.cursor = 'grab';
  svg.addEventListener('click', (e) => {
    if (e.target.closest('.graph-node')) return;
    if (focusId) { clearGraphFocus(); onChange(); }
  });

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
    const focusDim = focused && !focused.has(id);
    const filterDim = matchedIds && !matchedIds.has(id);
    const paintDim = paintNodes && !paintNodes.has(node.kind === 'file' ? node.file.path : id);
    const dimmed = focusDim || filterDim || paintDim;
    const isMatch = !!(matchedIds && matchedIds.has(id));
    const isFocus = id === focusId;
    const justExpanded = isUnderFocusDir(node);
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
    g.setAttribute('class', `graph-node graph-node-${node.kind}${isFocus ? ' focus' : ''}${dimmed ? ' dim' : ''}${isMatch ? ' match' : ''}${justExpanded ? ' just-expanded' : ''}`);
    g.style.cursor = 'pointer';

    if (node.kind === 'dir') {
      // Box width comes straight from the layout's measured footprint (pos.w),
      // so the drawn box exactly fills its packed slot and never overlaps a
      // neighbour. Both text lines are centered within it.
      const titleText = `▸ ${node.dir}/`;
      const subText = `${node.files.length} files · click to expand`;
      const w = pos.w, h = Math.max(48, pos.r * 2.6);
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(-w / 2)); rect.setAttribute('y', String(-h / 2));
      rect.setAttribute('width', String(w)); rect.setAttribute('height', String(h));
      rect.setAttribute('rx', '8');
      rect.setAttribute('fill', isFocus ? alpha(SELECT_FILL, '40') : alpha(DIR_COLOR, '33'));
      rect.setAttribute('stroke', isFocus ? SELECT_STROKE : DIR_COLOR);
      rect.setAttribute('stroke-width', isFocus ? '2.5' : '1.5');
      rect.setAttribute('stroke-dasharray', '4,3');
      g.appendChild(rect);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'graph-node-label graph-dir-label');
      label.setAttribute('x', '0'); label.setAttribute('y', '-2');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = titleText;
      g.appendChild(label);
      const sub = document.createElementNS(SVG_NS, 'text');
      sub.setAttribute('class', 'graph-node-sublabel');
      sub.setAttribute('x', '0'); sub.setAttribute('y', '14');
      sub.setAttribute('text-anchor', 'middle');
      sub.textContent = subText;
      g.appendChild(sub);
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${node.dir}/ (collapsed)\n${node.files.length} files · ${node.lineCount} lines\nimports ${outgoing.get(id).size} · imported by ${incoming.get(id).size}`;
      g.appendChild(title);
      g.addEventListener('click', (e) => { e.stopPropagation(); toggleGraphDir(node.dir); onChange(); });
    } else {
      const f = node.file;
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('r', String(pos.r));
      circle.setAttribute('fill', isFocus ? SELECT_FILL : (f.langColor ? alpha(f.langColor, 'cc') : '#888'));
      circle.setAttribute('stroke', isFocus ? SELECT_STROKE : (f.langColor || '#888'));
      circle.setAttribute('stroke-width', isFocus ? '3' : '1');
      g.appendChild(circle);
      const showLabel = isFocus || isMatch || justExpanded || (focused && focused.has(id)) || pos.r > 8 || nodes.size <= 80;
      if (showLabel) {
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', `graph-node-label${isMatch ? ' match' : ''}`);
        label.setAttribute('x', '0');
        const labelAbove = (pos.col % 2) === 1;
        label.setAttribute('y', String(labelAbove ? -(pos.r + 6) : (pos.r + 12)));
        label.setAttribute('text-anchor', 'middle');
        label.textContent = truncate(basename(f.path), 22);
        g.appendChild(label);
      }
      const title = document.createElementNS(SVG_NS, 'title');
      const outN = outgoing.get(id).size, inN = incoming.get(id).size;
      title.textContent = `${f.path}\n${f.lang} · ${f.lineCount} lines · ${f.fns.length} fns\nimports ${outN} · imported by ${inN}\nclick: focus · double-click: open in trace`;
      g.appendChild(title);
      g.addEventListener('click', (e) => { e.stopPropagation(); pushHistory(captureSnapshot()); selectFile(f.path); onChange(); });
      g.addEventListener('dblclick', (e) => { e.stopPropagation(); pushHistory(captureSnapshot()); selectFile(f.path); exitFullscreen(); onChange(); });
      g.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const role = STATE.paint.startKey ? 'end' : 'start';
        if (!setPaintEndpoint(role, 'file', f.path)) {
          alert('Path painter is in fn mode — clear the path to switch to file mode.');
        }
        onChange();
      });
    }
    ng.appendChild(g);
  }
  svg.appendChild(ng);

  const ctrl = attachPanZoom(svg, W, H);

  host.appendChild(svg);
  if (nodes.size > 12) host.appendChild(buildMinimap(positions, W, H, ctrl, focusId));

  // Consume the just-expanded marker: the framing + pulse fire on this render
  // only, so the highlight settles instead of replaying on later re-renders.
  STATE.graphFocusDir = null;
  return host;
}

// The on-screen footprint width of a node, used to pack rows without collisions.
// Must stay in sync with the box/label drawing below: a folder box is as wide as
// its longest text line; a file is its (truncated) label, or just its dot when
// labels are hidden on large maps.
function nodeLayoutWidth(node, r, nodeCount) {
  if (node.kind === 'dir') {
    const titleText = `▸ ${node.dir}/`;
    const subText = `${node.files.length} files · click to expand`;
    const textW = Math.max(titleText.length * 7.7, subText.length * 5.9) + 28;
    return Math.max(120, r * 6, textW);
  }
  // Mirrors the render-time showLabel test for the common cases (small maps label
  // everything; large files always carry a label). Transient focus/match labels
  // are rare enough that minor crowding there is acceptable.
  const labelLikely = nodeCount <= 80 || r > 8;
  const labelW = labelLikely ? Math.min(basename(node.file.path).length, 22) * 6.2 : 0;
  return Math.max(r * 2, labelW);
}

function fitView(positions, W, H) {
  return fitPositions([...positions.values()], W, H);
}

// Frame an arbitrary set of node positions. `pad` scales the surrounding margin
// relative to the content size — a value > 1 leaves breathing room so framed
// content keeps some of its neighbourhood visible for orientation.
function fitPositions(posList, W, H, pad = 1) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of posList) {
    minX = Math.min(minX, p.x - p.r); maxX = Math.max(maxX, p.x + p.r);
    minY = Math.min(minY, p.y - p.r); maxY = Math.max(maxY, p.y + p.r);
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: W, h: H };
  const cw = maxX - minX, ch = maxY - minY;
  const m = Math.max(80, Math.max(cw, ch) * 0.25 * (pad - 1) + 80);
  return { x: minX - m, y: minY - m, w: cw + m * 2, h: ch + m * 2 };
}

// A live thumbnail of the whole graph with a draggable viewport rectangle —
// the "you are here" anchor that keeps you oriented while zoomed into a big map.
function buildMinimap(positions, W, H, ctrl, focusId) {
  const MM_MAX = 190;
  const aspect = W / H;
  const mmW = aspect >= 1 ? MM_MAX : Math.round(MM_MAX * aspect);
  const mmH = aspect >= 1 ? Math.round(MM_MAX / aspect) : MM_MAX;

  const wrap = el('div', { cls: 'graph-minimap' });
  wrap.style.width = mmW + 'px';
  wrap.style.height = mmH + 'px';

  const mm = document.createElementNS(SVG_NS, 'svg');
  mm.setAttribute('viewBox', `0 0 ${W} ${H}`);
  // Element aspect matches the viewBox aspect, so there's no letterboxing and
  // client→graph coordinate mapping below stays a simple linear scale.
  mm.setAttribute('preserveAspectRatio', 'none');
  mm.setAttribute('class', 'graph-minimap-svg');

  let focusDot = null;
  for (const [id, pos] of positions) {
    const isFocus = id === focusId;
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(pos.x));
    dot.setAttribute('cy', String(pos.y));
    // Inflate radius so even tiny file nodes register at thumbnail scale; the
    // selected node gets a larger, fully-opaque bright dot so you can spot where
    // it sits in the whole map at a glance.
    dot.setAttribute('r', String(isFocus ? Math.max(13, pos.r * 1.6) : Math.max(7, pos.r)));
    dot.setAttribute('fill', isFocus ? SELECT_FILL : (pos.node.kind === 'dir' ? DIR_COLOR : (pos.node.langColor || '#888')));
    dot.setAttribute('opacity', isFocus ? '1' : '0.6');
    if (isFocus) { focusDot = dot; continue; } // drawn last so nothing overlaps it
    mm.appendChild(dot);
  }
  // Paint the selection on top of the dot field.
  if (focusDot) mm.appendChild(focusDot);

  const vp = document.createElementNS(SVG_NS, 'rect');
  vp.setAttribute('class', 'graph-minimap-vp');
  const drawVp = (v) => {
    vp.setAttribute('x', String(v.x));
    vp.setAttribute('y', String(v.y));
    vp.setAttribute('width', String(Math.max(0, v.w)));
    vp.setAttribute('height', String(Math.max(0, v.h)));
  };
  drawVp(ctrl.getView());
  mm.appendChild(vp);
  ctrl.onView = drawVp;

  let dragging = false;
  const recenter = (e) => {
    const rect = mm.getBoundingClientRect();
    const gx = (e.clientX - rect.left) / rect.width * W;
    const gy = (e.clientY - rect.top) / rect.height * H;
    const v = ctrl.getView();
    ctrl.setView({ x: gx - v.w / 2, y: gy - v.h / 2, w: v.w, h: v.h });
  };
  mm.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dragging = true;
    mm.setPointerCapture(e.pointerId);
    recenter(e);
  });
  mm.addEventListener('pointermove', (e) => { if (dragging) recenter(e); });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    try { mm.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  mm.addEventListener('pointerup', end);
  mm.addEventListener('pointercancel', end);

  wrap.appendChild(mm);
  return wrap;
}

function attachPanZoom(svg, W, H) {
  const ctrl = { onView: null };
  const getView = () => {
    const v = svg.viewBox.baseVal;
    return { x: v.x, y: v.y, w: v.width, h: v.height };
  };
  const setView = (v) => {
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    STATE.graphView = v;
    if (ctrl.onView) ctrl.onView(v);
  };
  ctrl.getView = getView;
  ctrl.setView = setView;
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

  return ctrl;
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
    on: { click: () => { pushHistory(captureSnapshot()); selectFile(otherPath); onChange(); } },
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
