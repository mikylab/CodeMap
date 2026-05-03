import { fnKey } from '../trace-graph.js';
import { cxBucket } from '../tabs.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COL_W = 200;
const ROW_H = 56;
const NODE_W = 168;
const NODE_H = 38;
const PAD = 24;

export function renderTraceGraph(tree, selected, onSelect, onSetRoot) {
  const host = document.createElement('div');
  host.className = 'trace-graph-host';
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
  const selKey = selected ? fnKey(selected.fn) : null;
  for (const n of items) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
    const classes = ['trace-svg-node'];
    if (n.unresolved) classes.push('unresolved');
    if (n.ambiguous) classes.push('ambiguous');
    if (n.fn.cx >= 7 && !n.unresolved) classes.push('warn');
    if (!n.unresolved && fnKey(n.fn) === selKey) classes.push('active');
    if (!n.unresolved) classes.push(`cx-${cxBucket(n.fn.cx)}`);
    g.setAttribute('class', classes.join(' '));

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(NODE_W));
    rect.setAttribute('height', String(NODE_H));
    rect.setAttribute('rx', '4');
    g.appendChild(rect);

    const name = document.createElementNS(SVG_NS, 'text');
    name.setAttribute('class', 'trace-svg-name');
    name.setAttribute('x', '10');
    name.setAttribute('y', '16');
    name.textContent = truncate(n.fn.name, 22);
    g.appendChild(name);

    const sub = document.createElementNS(SVG_NS, 'text');
    sub.setAttribute('class', 'trace-svg-sub');
    sub.setAttribute('x', '10');
    sub.setAttribute('y', '30');
    sub.textContent = n.unresolved
      ? '(unresolved)'
      : `${baseName(n.fn.file)} · cx:${n.fn.cx}`;
    g.appendChild(sub);

    if (!n.unresolved) {
      g.addEventListener('click', () => onSelect(fnKey(n.fn)));
      g.addEventListener('dblclick', () => onSetRoot(n.fn));
      g.style.cursor = 'pointer';
    }
    ng.appendChild(g);
  }
  svg.appendChild(ng);
  host.appendChild(svg);
  return host;
}

// BFS layout. items[i] corresponds to BFS-visit order; edges reference indices.
function layout(tree) {
  const items = [];
  const edges = [];
  const queue = [{ node: tree, col: 0, parentIdx: -1 }];
  const rowsAtCol = new Map();
  while (queue.length) {
    const { node, col, parentIdx, parentNode } = queue.shift();
    const row = rowsAtCol.get(col) || 0;
    rowsAtCol.set(col, row + 1);
    const idx = items.length;
    items.push({
      fn: node.fn,
      col, row,
      x: PAD + col * COL_W,
      y: PAD + row * ROW_H,
      unresolved: !!node.unresolved,
      ambiguous: !!node.ambiguous,
    });
    if (parentIdx >= 0) {
      edges.push({
        from: parentIdx,
        to: idx,
        confidence: node.confidence || 'low',
        ambiguous: !!node.ambiguous,
      });
    }
    for (const child of node.children) {
      queue.push({ node: child, col: col + 1, parentIdx: idx, parentNode: node });
    }
  }
  return { items, edges };
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function baseName(p) { return p.split(/[\\/]/).pop() || ''; }
