import { STATE, setActiveTab } from './state.js';
import { TABS } from './tabs.js';
import { el, clear } from './dom.js';

export function renderToolbar(onTabChange, onDropClick) {
  const root = document.getElementById('toolbar');
  clear(root);
  root.appendChild(logo());
  root.appendChild(tabPills(onTabChange));
  root.appendChild(el('div', { cls: 'tb-spacer' }));
  root.appendChild(projectBadge());
  root.appendChild(dropButton(onDropClick));
}

function logo() {
  return el('div', { cls: 'tb-logo' }, [
    el('span', { cls: 'tb-logo-name', text: 'codemap' }),
    el('span', { cls: 'tb-logo-ver', text: 'v2' }),
  ]);
}

function tabPills(onTabChange) {
  const wrap = el('div', { cls: 'tab-pills' });
  for (const t of TABS) {
    const cls = `tab-pill${t.id === STATE.activeTab ? ' active' : ''}${t.enabled ? '' : ' disabled'}`;
    wrap.appendChild(el('button', {
      cls, type: 'button', text: t.label, disabled: !t.enabled,
      on: t.enabled ? { click: () => { setActiveTab(t.id); onTabChange(); } } : {},
    }));
  }
  return wrap;
}

function projectBadge() {
  const text = STATE.files.length ? `${STATE.files.length} files` : 'no project';
  return el('div', { cls: 'tb-project', text });
}

function dropButton(onClick) {
  return el('button', {
    cls: 'tb-drop', type: 'button', text: 'Drop repo / files',
    on: { click: onClick },
  });
}
