import { fnKey } from '../trace-graph.js';
import { cxBucket } from '../tabs.js';
import { STATE } from '../state.js';
import { basename } from '../dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COL_W = 240;
const ROW_H = 64;
const NODE_W = 200;
const NODE_H = 48;
const PAD = 24;

export function renderTraceMap(tree, onSetRoot, onToggleBranch, expandedBranches) {
  const host = document.createElement('div');
  host.className = 'trace-graph-host';
  if (!tree) return host;

  const { items, edges } = layout(tree, expandedBranches || new Set());
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
  for (const c of ['high', 'med', 'low', 'amb']) {
    const m = document.createElementNS(SVG_NS, 'marker');
    m.setAttribute('id', `arrow-${c}`);
    m.setAttribute('viewBox', '0 0 10 10');
    m.setAttribute('refX', '10'); m.setAttribute('refY', '5');
    m.setAttribute('markerWidth', '7'); m.setAttribute('markerHeight', '7');
    m.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M0,0 L10,5 L0,10 z');
    p.setAttribute('class', `trace-svg-arrow conf-${c}`);
    m.appendChild(p);
    defs.appendChild(m);
  }
  svg.appendChild(defs);

  // edges
  const eg = document.createElementNS(SVG_NS, 'g');
  for (const e of edges) {
    const a = items[e.from];
    const b = items[e.to];
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const cx = (x1 + x2) / 2;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`);
    const conf = e.ambiguous ? 'amb' : (e.confidence || 'low');
    path.setAttribute('class', `trace-svg-edge conf-${conf}`);
    path.setAttribute('marker-end', `url(#arrow-${conf})`);
    eg.appendChild(path);
  }
  svg.appendChild(eg);

  // nodes
  const ng = document.createElementNS(SVG_NS, 'g');
  const rootKey = items.length ? fnKey(items[0].fn) : null;
  for (const n of items) {
    const fnK = fnKey(n.fn);
    const fanIn = STATE.fanIn.get(fnK) || 0;
    const fanOut = STATE.fanOut.get(fnK) || 0;

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
    const cls = ['trace-svg-node', `cx-${cxBucket(n.fn.cx)}`];
    if (n.fn.cx >= 7) cls.push('warn');
    if (n.cycle) cls.push('cycle');
    if (fnK === rootKey) cls.push('active');
    g.setAttribute('class', cls.join(' '));
    g.style.cursor = 'pointer';

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(NODE_W));
    rect.setAttribute('height', String(NODE_H));
    rect.setAttribute('rx', '6');
    g.appendChild(rect);

    const fileLbl = document.createElementNS(SVG_NS, 'text');
    fileLbl.setAttribute('class', 'trace-svg-file');
    fileLbl.setAttribute('x', '10');
    fileLbl.setAttribute('y', '14');
    fileLbl.textContent = truncate(basename(n.fn.file), 28);
    g.appendChild(fileLbl);

    const name = document.createElementNS(SVG_NS, 'text');
    name.setAttribute('class', 'trace-svg-name');
    name.setAttribute('x', '10');
    name.setAttribute('y', '30');
    name.textContent = truncate(n.fn.name + '()', 26);
    g.appendChild(name);

    const meta = document.createElementNS(SVG_NS, 'text');
    meta.setAttribute('class', 'trace-svg-meta');
    meta.setAttribute('x', '10');
    meta.setAttribute('y', '42');
    const parts = [`cx:${n.fn.cx}`, `←${fanIn}`, `→${fanOut}`];
    if (n.extCount) parts.push(`+${n.extCount} ext`);
    if (n.cycle) parts.push('cycle');
    meta.textContent = parts.join(' · ');
    g.appendChild(meta);

    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent =
      `${n.fn.name}()  —  ${n.fn.file}:${n.fn.lineNum}\n` +
      `complexity ${n.fn.cx} · callers ${fanIn} · calls ${fanOut}` +
      (n.extCount ? `\nexternal calls (${n.extCount}): ${n.extNames.join(', ')}${n.extCount > n.extNames.length ? ', …' : ''}` : '') +
      `\nclick: re-root map on this function`;
    g.appendChild(title);

    g.addEventListener('click', () => onSetRoot(n.fn));

    // Hidden-descendants badge: shown on collapsed branches that have further callees.
    if (n.hiddenCount > 0) {
      const badgeW = 38;
      const badgeH = 18;
      const bx = NODE_W - badgeW - 6;
      const by = NODE_H - badgeH - 6;
      const bg = document.createElementNS(SVG_NS, 'g');
      bg.setAttribute('class', 'trace-svg-expand');
      bg.setAttribute('transform', `translate(${bx},${by})`);
      bg.style.cursor = 'pointer';
      const br = document.createElementNS(SVG_NS, 'rect');
      br.setAttribute('width', String(badgeW));
      br.setAttribute('height', String(badgeH));
      br.setAttribute('rx', '4');
      bg.appendChild(br);
      const bt = document.createElementNS(SVG_NS, 'text');
      bt.setAttribute('x', String(badgeW / 2));
      bt.setAttribute('y', String(badgeH / 2 + 4));
      bt.setAttribute('text-anchor', 'middle');
      bt.textContent = n.expanded ? '−' : `+${n.hiddenCount}`;
      bg.appendChild(bt);
      const btitle = document.createElementNS(SVG_NS, 'title');
      btitle.textContent = n.expanded
        ? 'Collapse this branch'
        : `${n.hiddenCount} more reachable — click to expand one level`;
      bg.appendChild(btitle);
      bg.addEventListener('click', (e) => {
        e.stopPropagation();
        onToggleBranch && onToggleBranch(fnK);
      });
      g.appendChild(bg);
    }
    ng.appendChild(g);
  }
  svg.appendChild(ng);
  host.appendChild(svg);
  return host;
}

// Layout: items[i] is the i-th placed node; edges reference indices.
// Renders root (depth 0) + its direct children (depth 1) by default. Any node
// whose fnKey is in `expandedBranches` recursively reveals its own children
// in the next column, so users can walk a chain start-to-end.
function layout(tree, expandedBranches) {
  const items = [];
  const edges = [];
  const rowsAtCol = new Map();

  function placeRow(col) {
    const row = rowsAtCol.get(col) || 0;
    rowsAtCol.set(col, row + 1);
    return row;
  }

  function pushItem(node, col, isExpanded, hiddenCount) {
    const row = placeRow(col);
    items.push({
      fn: node.fn,
      col, row,
      x: PAD + col * COL_W,
      y: PAD + row * ROW_H,
      extCount: node.extCount || 0,
      extNames: node.extNames || [],
      cycle: !!node.cycle,
      hiddenCount,
      expanded: !!isExpanded,
    });
    return items.length - 1;
  }

  function reachUnder(node) {
    return node.subtree && node.subtree.reach ? (node.subtree.reach - 1) : 0;
  }

  // Root: no expand badge (single-click re-roots instead).
  const rootIdx = pushItem(tree, 0, false, 0);

  function placeChildren(parentNode, parentIdx, col) {
    for (const child of parentNode.children) {
      const childKey = fnKey(child.fn);
      const hasKids = child.children.length > 0;
      const isExpanded = hasKids && expandedBranches.has(childKey);
      const hidden = hasKids && !isExpanded ? reachUnder(child) : 0;
      const childIdx = pushItem(child, col, isExpanded, hidden);
      edges.push({
        from: parentIdx, to: childIdx,
        confidence: child.confidence || 'low',
        ambiguous: !!child.ambiguous,
      });
      if (isExpanded) placeChildren(child, childIdx, col + 1);
    }
  }

  placeChildren(tree, rootIdx, 1);

  return { items, edges };
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
