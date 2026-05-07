// Phase 9c — paint chip strip shared between graph and trace tabs.
import { STATE, clearPaint, reversePaintDirection } from '../state.js';
import { el, basename } from '../dom.js';
import { findPaths, fnGraphFromState, fileGraphFromState } from '../paths.js';

export function renderPaintStrip(onChange) {
  const p = STATE.paint;
  if (!p || !p.kind) return null;
  const wrap = el('div', { cls: 'paint-strip' });
  wrap.appendChild(el('span', { text: `paint (${p.kind})` }));
  wrap.appendChild(chip('start', p.startKey));
  wrap.appendChild(el('span', { text: '→' }));
  wrap.appendChild(chip('end', p.endKey));
  if (p.startKey && !p.endKey) {
    wrap.appendChild(el('button', {
      cls: 'paint-btn', type: 'button', text: `reverse: ${p.direction}`,
      title: 'Toggle forward/reverse closure from start',
      on: { click: () => { reversePaintDirection(); onChange(); } },
    }));
  }
  if (p.startKey && p.endKey) {
    const paths = findPaths(graphFor(p.kind), p.startKey, p.endKey);
    wrap.appendChild(el('span', { text: paths.length ? `${paths.length} path${paths.length === 1 ? '' : 's'}` : 'no path' }));
  }
  wrap.appendChild(el('button', {
    cls: 'paint-btn', type: 'button', text: 'clear ✕',
    on: { click: () => { clearPaint(); onChange(); } },
  }));
  return wrap;
}

function chip(role, key) {
  if (!key) return el('span', { cls: `paint-chip ${role} empty`, text: `set ${role}` });
  return el('span', { cls: `paint-chip ${role}`, text: shortLabel(key), title: key });
}

function shortLabel(key) {
  // fn key: file::name@line  /  file key: path
  const m = key.match(/^(.+)::(\w+)@/);
  if (m) return `${m[2]}() · ${basename(m[1])}`;
  return basename(key);
}

export function graphFor(kind) {
  return kind === 'fn' ? fnGraphFromState(STATE) : fileGraphFromState(STATE);
}

// Compute the painted node-set for the current paint state. Returns:
//   { mode: 'paths'|'reach'|'none', nodes: Set, paths: Path[] }
export function computePaint() {
  const p = STATE.paint;
  if (!p || !p.kind || !p.startKey) return { mode: 'none', nodes: new Set(), paths: [] };
  const g = graphFor(p.kind);
  if (p.endKey) {
    const paths = findPaths(g, p.startKey, p.endKey);
    const nodes = new Set();
    for (const path of paths) for (const n of path.nodes) nodes.add(n);
    return { mode: 'paths', nodes, paths };
  }
  // Reach (forward or reverse) — keep cheap: import here so we don't recurse.
  // (Recompute via findReach inline.)
  const reachSet = new Set([p.startKey]);
  const adj = p.direction === 'reverse' ? reverseAdj(g) : g.edges;
  const queue = [p.startKey];
  while (queue.length) {
    const cur = queue.shift();
    for (const v of (adj.get(cur) || [])) {
      if (reachSet.has(v)) continue;
      reachSet.add(v);
      queue.push(v);
    }
  }
  return { mode: 'reach', nodes: reachSet, paths: [] };
}

function reverseAdj(g) {
  const rev = new Map();
  for (const [from, set] of g.edges) for (const to of set) {
    let s = rev.get(to);
    if (!s) rev.set(to, s = new Set());
    s.add(from);
  }
  return rev;
}
