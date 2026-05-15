import { STATE, hasGitStats, setFullscreen, toggleFnEffectFilter, toggleHelp, exitFullscreen, closeHelp, clearSelection } from './state.js';
import { EFFECT_TAGS } from './effects-config.js';
import { el, clear } from './dom.js';

export function renderToolbar(onChange, onDropClick) {
  const root = document.getElementById('toolbar');
  clear(root);
  root.appendChild(logo(onChange));
  root.appendChild(modeButtons(onChange));
  root.appendChild(el('div', { cls: 'tb-spacer' }));
  if (STATE.files.length) {
    root.appendChild(effectChips(onChange));
    root.appendChild(smellBadge(onChange));
    root.appendChild(historyBadge(onChange));
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

function logo(onChange) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'tb-logo-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<circle cx="6" cy="6" r="2.4" fill="currentColor"/>' +
    '<circle cx="18" cy="6" r="2.4" fill="currentColor" opacity="0.55"/>' +
    '<circle cx="6" cy="18" r="2.4" fill="currentColor" opacity="0.55"/>' +
    '<circle cx="18" cy="18" r="2.4" fill="currentColor"/>' +
    '<path d="M6 6 L18 18 M6 18 L18 6 M6 6 L6 18 M18 6 L18 18" ' +
    'stroke="currentColor" stroke-width="1.2" opacity="0.45" fill="none"/>';
  const btn = el('button', {
    cls: 'tb-logo',
    type: 'button',
    title: 'Back to repo overview',
    on: { click: () => {
      clearSelection();
      exitFullscreen();
      closeHelp();
      onChange();
    } },
  });
  btn.appendChild(svg);
  btn.appendChild(el('span', { cls: 'tb-logo-name', text: 'codemap' }));
  btn.appendChild(el('span', { cls: 'tb-logo-ver', text: 'v3' }));
  return btn;
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

function historyBadge(onChange) {
  const active = STATE.fullscreen === 'history';
  const loaded = hasGitStats();
  const n = Object.keys(STATE.gitStatsByPath).length;
  const cls = 'tb-history-badge' + (loaded ? '' : ' empty') + (active ? ' active' : '');
  const title = loaded
    ? `${n} file${n === 1 ? '' : 's'} with git history — open History (4)`
    : 'Drop a git log to enable history — open for instructions';
  return el('button', {
    cls,
    type: 'button',
    text: '⏱ history',
    title,
    on: { click: () => { setFullscreen(active ? null : 'history'); onChange(); } },
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
