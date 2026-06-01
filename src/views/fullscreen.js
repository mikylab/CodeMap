import { STATE, exitFullscreen } from '../state.js';
import { el, clear } from '../dom.js';
import { renderWalk } from './walk.js';
import { renderGraphView } from './graph.js';
import { renderSmells } from './smells.js';
import { renderLineageOverlay } from '../lineage-render.js';
import { renderDocsPicker } from './docs-picker.js';

// Browser fullscreen can be entered/exited by means we don't control (Esc, the
// OS, the async resolution of requestFullscreen). Re-render on every change so
// the toggle label and the `:fullscreen` layout always reflect the real state.
document.addEventListener('fullscreenchange', () => {
  document.dispatchEvent(new CustomEvent('codemap:rerender'));
});

export function renderFullscreen(onChange) {
  const root = document.getElementById('fullscreen');
  clear(root);
  if (!STATE.fullscreen) {
    root.style.display = 'none';
    return;
  }
  root.style.display = 'flex';
  root.appendChild(header(onChange));
  const body = el('div', { cls: 'fs-body' });
  body.appendChild(viewFor(STATE.fullscreen, onChange));
  root.appendChild(body);
}

function header(onChange) {
  const labels = { walk: '🗺  Walk', graph: '◉  Graph', smells: '⚠  Smells', lineage: '🌳  Lineage', docs: '📄  Docs' };
  const subs = {
    walk:    'Guided tour of your repo. Click any chip to jump into the workspace.',
    graph:   'Files as nodes, imports as edges. Right-click two nodes to paint paths.',
    smells:  'Heuristic findings across the repo. Click any to open in the workspace.',
    lineage: 'Stacked-branch lineage parsed from your README. Click a branch to read its note.',
    docs:    'Captured markdown docs. Click one to render it in the workspace.',
  };
  const head = el('div', { cls: 'fs-head' });
  head.appendChild(el('div', { cls: 'fs-title' }, [
    el('span', { cls: 'fs-title-text', text: labels[STATE.fullscreen] }),
    el('span', { cls: 'fs-title-sub', text: subs[STATE.fullscreen] }),
  ]));
  // True browser fullscreen — promotes the overlay edge-to-edge and hides the
  // toolbar/chrome behind it. Placed in the header (next to Close) because
  // that's the conventional, discoverable spot for an expand control.
  head.appendChild(el('button', {
    cls: 'fs-fullscreen-btn', type: 'button',
    text: document.fullscreenElement ? '⤡  Exit full screen' : '⛶  Full screen',
    title: 'Expand edge-to-edge, hiding everything else (Esc to exit)',
    on: { click: () => { toggleBrowserFullscreen(); onChange(); } },
  }));
  head.appendChild(el('button', {
    cls: 'fs-close', type: 'button', text: '← back to workspace (Esc)',
    on: { click: () => { exitFullscreen(); onChange(); } },
  }));
  return head;
}

// Toggle true browser fullscreen on the persistent overlay root. We target
// `#fullscreen` (not an inner view element) because it survives the overlay's
// re-renders, so interacting with the view won't drop you out of fullscreen.
function toggleBrowserFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }
  const root = document.getElementById('fullscreen');
  root?.requestFullscreen?.().catch(() => {});
}

function viewFor(name, onChange) {
  if (name === 'walk')    return renderWalk(onChange);
  if (name === 'graph')   return renderGraphView(onChange);
  if (name === 'smells')  return renderSmells(onChange);
  if (name === 'lineage') return renderLineageOverlay(onChange);
  if (name === 'docs')    return renderDocsPicker(onChange);
  return el('div');
}
