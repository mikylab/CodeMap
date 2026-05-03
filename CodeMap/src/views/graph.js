import { STATE, selectPath } from '../state.js';
import { el } from '../dom.js';
import { renderGraph, hitTest, computeLayout } from '../graph.js';

let resizeObserver = null;
let lastCanvas = null;

export function renderGraphView(onChange) {
  if (!STATE.files.length) return splash();

  const wrap = el('div', { cls: 'graph-root' });
  wrap.appendChild(el('div', {
    cls: 'view-hint',
    text: 'Files are nodes (size ∝ √lineCount, color = language). Edges connect files that share an external import or language. Hover to highlight neighbors; click to select in sidebar.',
  }));

  const host = el('div', { cls: 'graph-host' });
  const canvas = el('canvas', { cls: 'graph-canvas' });
  host.appendChild(canvas);
  wrap.appendChild(host);

  // Render after the canvas is attached and sized.
  requestAnimationFrame(() => attach(canvas, host, onChange));
  return wrap;
}

function attach(canvas, host, onChange) {
  if (!canvas.isConnected) return;
  let layout = renderGraph(canvas, STATE.files).layout;

  const draw = () => { layout = renderGraph(canvas, STATE.files).layout; };

  // Disconnect any prior observer (idempotent re-render).
  if (resizeObserver) { try { resizeObserver.disconnect(); } catch {} }
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(host);
  }
  lastCanvas = canvas;

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const hit = hitTest(layout, e.clientX - rect.left, e.clientY - rect.top);
    canvas.style.cursor = hit ? 'pointer' : 'default';
    canvas.title = hit ? hit.path : '';
  });
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const hit = hitTest(layout, e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) return;
    selectPath(hit.path);
    onChange();
  });
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-icon', text: '🕸️' }),
    el('div', { cls: 'splash-title', text: 'No graph yet' }),
    el('div', { cls: 'splash-sub', text: 'Drop a folder to see file relationships.' }),
  ]);
}

// Re-export for tests that want pure layout/edge fns from a single entry.
export { computeLayout };
