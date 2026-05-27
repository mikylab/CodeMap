import {
  STATE, setFullscreen, toggleFnEffectFilter, toggleHelp, exitFullscreen, closeHelp,
  clearSelection, resetAll,
} from './state.js';
import { clearHash } from './hash-state.js';
import { EFFECT_TAGS } from './effects-config.js';
import { el, clear } from './dom.js';
import { VERSION } from './version.js';

export function renderToolbar(onChange, onDropClick, onUrlClick) {
  const root = document.getElementById('toolbar');
  clear(root);
  root.appendChild(logo(onChange));
  root.appendChild(modeButtons(onChange));
  root.appendChild(el('div', { cls: 'tb-spacer' }));
  if (STATE.files.length) {
    root.appendChild(effectChips(onChange));
    root.appendChild(smellBadge(onChange));
  }
  root.appendChild(projectBadge());
  root.appendChild(helpButton(onChange));
  root.appendChild(urlButton(onUrlClick));
  root.appendChild(dropButton(onDropClick));
  if (STATE.files.length || STATE.docs.length || STATE.lastRepoMeta) {
    root.appendChild(clearButton(onChange));
  }
}

function clearButton(onChange) {
  return el('button', {
    cls: 'tb-clear', type: 'button', text: 'Clear',
    title: 'Unload this project and clear the URL — returns to the empty drop screen',
    on: { click: () => {
      if (!confirm('Clear the loaded project? The URL hash will be reset too.')) return;
      resetAll();
      clearHash();
      const warnbar = document.getElementById('warnbar');
      if (warnbar) { warnbar.hidden = true; warnbar.textContent = ''; }
      onChange();
    } },
  });
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
  btn.appendChild(el('span', { cls: 'tb-logo-ver', text: 'v' + VERSION }));
  return btn;
}

function modeButtons(onChange) {
  const wrap = el('div', { cls: 'tb-modes' });
  const items = [
    { id: 'walk',    label: '🗺  Walk',    title: 'Open the guided walkthrough', needsFiles: true },
    { id: 'graph',   label: '◉  Graph',   title: 'Open the dependency graph', needsFiles: true },
    { id: 'lineage', label: '🌳  Lineage', title: 'Open the branch-lineage tree (parsed from README)', needsLineage: true },
    { id: 'docs',    label: '📄  Docs',    title: 'Browse captured markdown docs', needsDocs: true },
  ];
  for (const it of items) {
    if (it.needsLineage && !STATE.lineage) continue;
    if (it.needsDocs && !STATE.docs.length) continue;
    const active = STATE.fullscreen === it.id;
    wrap.appendChild(el('button', {
      cls: `tb-mode${active ? ' active' : ''}`,
      type: 'button',
      text: it.label,
      title: it.title,
      disabled: it.needsFiles && !STATE.files.length,
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

function urlButton(onClick) {
  return el('button', {
    cls: 'tb-url', type: 'button', text: 'Load URL',
    title: 'Load a GitHub or GitLab repo by URL',
    on: { click: onClick },
  });
}
