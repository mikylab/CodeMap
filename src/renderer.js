import { STATE } from './state.js';
import { renderToolbar } from './toolbar.js';
import { renderNavigator } from './navigator.js';
import { renderStatBar } from './statbar.js';
import { renderWorkspace } from './views/workspace.js';
import { renderFullscreen } from './views/fullscreen.js';
import { clear } from './dom.js';

export function renderAll() {
  renderToolbar(renderAll, () => document.getElementById('dir-picker')?.click());
  renderNavigator(renderAll);
  renderStatBar();
  renderWorkspaceShell();
  renderFullscreen(renderAll);
}

function renderWorkspaceShell() {
  const root = document.getElementById('workspace');
  clear(root);
  root.appendChild(renderWorkspace(renderAll));
}
