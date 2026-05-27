import { STATE } from './state.js';
import { renderToolbar } from './toolbar.js';
import { renderNavigator } from './navigator.js';
import { renderStatBar } from './statbar.js';
import { renderWorkspace } from './views/workspace.js';
import { renderFullscreen } from './views/fullscreen.js';
import { renderHelp } from './views/help.js';
import { clear } from './dom.js';
import { writeHash } from './hash-state.js';

export function renderAll() {
  renderToolbar(
    renderAll,
    () => document.getElementById('dir-picker')?.click(),
    () => document.dispatchEvent(new CustomEvent('codemap:open-url-loader')),
  );
  renderNavigator(renderAll);
  renderStatBar();
  renderWorkspaceShell();
  renderFullscreen(renderAll);
  renderHelp(renderAll);
  writeHash();
}

function renderWorkspaceShell() {
  const root = document.getElementById('workspace');
  clear(root);
  root.appendChild(renderWorkspace(renderAll));
  if (STATE.pendingScrollTop != null) {
    const target = STATE.pendingScrollTop;
    STATE.pendingScrollTop = null;
    const body = root.querySelector('.ws-body');
    if (body) body.scrollTop = target;
  }
}

document.addEventListener('codemap:rerender', renderAll);
