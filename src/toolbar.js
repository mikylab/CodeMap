import { STATE, setFullscreen, toggleFnEffectFilter, toggleHelp } from './state.js';
import { EFFECT_TAGS } from './effects-config.js';
import { el, clear } from './dom.js';

export function renderToolbar(onChange, onDropClick) {
  const root = document.getElementById('toolbar');
  clear(root);
  root.appendChild(logo());
  root.appendChild(modeButtons(onChange));
  root.appendChild(el('div', { cls: 'tb-spacer' }));
  if (STATE.files.length) {
    root.appendChild(effectChips(onChange));
    root.appendChild(smellBadge(onChange));
  }
  root.appendChild(projectBadge());
  root.appendChild(helpButton(onChange));
  root.appendChild(dropButton(onDropClick));
}

function helpButton(onChange) {
  return el('button', {
    cls: 'tb-help' + (STATE.helpOpen ? ' active' : ''),
    type: 'button',
    text: '?',
    title: 'What do these abbreviations mean? (h)',
    on: { click: () => { toggleHelp(); onChange(); } },
  });
}

function logo() {
  return el('div', { cls: 'tb-logo' }, [
    el('span', { cls: 'tb-logo-name', text: 'codemap' }),
    el('span', { cls: 'tb-logo-ver', text: 'v3' }),
  ]);
}

function modeButtons(onChange) {
  const wrap = el('div', { cls: 'tb-modes' });
  const items = [
    { id: 'walk',   label: '🗺  Walk',   title: 'Open the guided walkthrough' },
    { id: 'graph',  label: '◉  Graph',  title: 'Open the dependency graph' },
  ];
  for (const it of items) {
    const active = STATE.fullscreen === it.id;
    wrap.appendChild(el('button', {
      cls: `tb-mode${active ? ' active' : ''}`,
      type: 'button',
      text: it.label,
      title: it.title,
      disabled: !STATE.files.length,
      on: { click: () => { setFullscreen(active ? null : it.id); onChange(); } },
    }));
  }
  return wrap;
}

function effectChips(onChange) {
  const wrap = el('div', { cls: 'tb-fx-chips', title: 'Filter the navigator by side-effect' });
  for (const tag of EFFECT_TAGS) {
    const on = STATE.fnEffectFilter.has(tag);
    wrap.appendChild(el('button', {
      cls: `tb-fx-chip effect-${tag}${on ? ' on' : ''}`,
      type: 'button',
      text: tag,
      title: `Show only items with effect: ${tag}`,
      on: { click: () => { toggleFnEffectFilter(tag); onChange(); } },
    }));
  }
  return wrap;
}

function smellBadge(onChange) {
  const total = STATE.smells.length;
  const warns = STATE.smells.filter(s => s.severity === 'warn').length;
  const cls = warns ? 'tb-smell-badge warn' : (total ? 'tb-smell-badge info' : 'tb-smell-badge none');
  const label = total ? `⚠ ${total}` : '✓ clean';
  const active = STATE.fullscreen === 'smells';
  return el('button', {
    cls: cls + (active ? ' active' : ''),
    type: 'button',
    text: label,
    title: total ? `${warns} warn, ${total - warns} info — open Smells` : 'No smells detected',
    on: { click: () => { setFullscreen(active ? null : 'smells'); onChange(); } },
  });
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
