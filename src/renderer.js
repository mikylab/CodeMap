import { STATE } from './state.js';
import { renderToolbar } from './toolbar.js';
import { renderSidebar } from './sidebar.js';
import { renderStatBar } from './statbar.js';
import { renderOverview } from './views/overview.js';
import { renderWalk } from './views/walk.js';
import { renderFunctions } from './views/functions.js';
import { renderLibraries } from './views/libraries.js';
import { renderTrace } from './views/trace.js';
import { renderGraphView } from './views/graph.js';
import { renderSmells } from './views/smells.js';
import { clear } from './dom.js';

export function renderAll() {
  renderToolbar(renderAll, () => document.getElementById('dir-picker')?.click());
  renderSidebar(renderAll);
  renderStatBar();
  renderTab();
}

function renderTab() {
  const root = document.getElementById('tab-content');
  clear(root);
  root.appendChild(viewFor(STATE.activeTab));
}

function viewFor(tab) {
  switch (tab) {
    case 'overview':  return renderOverview();
    case 'walk':      return renderWalk(renderAll);
    case 'functions': return renderFunctions(renderAll);
    case 'libraries': return renderLibraries();
    case 'trace':     return renderTrace(renderAll);
    case 'graph':     return renderGraphView(renderAll);
    case 'smells':    return renderSmells(renderAll);
    default:          return renderOverview();
  }
}

