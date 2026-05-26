import { STATE, exitFullscreen } from '../state.js';
import { el, clear } from '../dom.js';
import { renderWalk } from './walk.js';
import { renderGraphView } from './graph.js';
import { renderSmells } from './smells.js';
import { renderLineageOverlay } from '../lineage-render.js';
import { renderDocsPicker } from './docs-picker.js';

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
  head.appendChild(el('button', {
    cls: 'fs-close', type: 'button', text: '← back to workspace (Esc)',
    on: { click: () => { exitFullscreen(); onChange(); } },
  }));
  return head;
}

function viewFor(name, onChange) {
  if (name === 'walk')    return renderWalk(onChange);
  if (name === 'graph')   return renderGraphView(onChange);
  if (name === 'smells')  return renderSmells(onChange);
  if (name === 'lineage') return renderLineageOverlay(onChange);
  if (name === 'docs')    return renderDocsPicker(onChange);
  return el('div');
}
