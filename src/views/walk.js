import { STATE, selectPath, setTraceRoot, setActiveTab, setFileTraceRoot, toggleWalkStep, setAllWalkStepsExpanded } from '../state.js';
import { STEP_COLORS } from '../tabs.js';
import { el } from '../dom.js';

export function renderWalk(onChange) {
  if (!STATE.walk.length) return splash();
  const wrap = el('div', { cls: 'walk-root' });
  wrap.appendChild(viewHint());
  wrap.appendChild(repoScopeBanner(onChange));
  wrap.appendChild(stepGrid(onChange));
  return wrap;
}

function viewHint() {
  return el('div', { cls: 'view-hint' }, [
    el('span', { cls: 'view-hint-name', text: 'Walk' }),
    el('span', { text: ' — Guided tour of your repo as a board. Click any card to expand its details.' }),
  ]);
}

function repoScopeBanner(onChange) {
  const fileCount = STATE.files.length;
  const total = STATE.walk.length;
  const expanded = STATE.expandedWalkSteps.size;
  const allOpen = expanded === total;
  const banner = el('div', { cls: 'walk-scope' });
  banner.appendChild(el('span', { cls: 'walk-scope-tag', text: 'REPO TOUR' }));
  banner.appendChild(el('span', {
    cls: 'walk-scope-text',
    text: `${total} sections covering all ${fileCount} file${fileCount === 1 ? '' : 's'}.`,
  }));
  banner.appendChild(el('button', {
    cls: 'walk-toggle-all', type: 'button',
    text: allOpen ? 'collapse all' : 'expand all',
    on: { click: () => { setAllWalkStepsExpanded(!allOpen); onChange(); } },
  }));
  return banner;
}

function stepGrid(onChange) {
  const grid = el('div', { cls: 'walk-grid' });
  STATE.walk.forEach((step, i) => {
    const color = STEP_COLORS()[step.category] || '#888780';
    grid.appendChild(stepCard(step, i, color, onChange));
  });
  return grid;
}

function stepCard(step, idx, color, onChange) {
  const expanded = STATE.expandedWalkSteps.has(idx);
  const card = el('div', {
    cls: 'walk-card' + (expanded ? ' expanded' : ''),
    style: { borderTopColor: color },
  });
  card.appendChild(cardHeader(step, idx, color, expanded, onChange));
  if (expanded) card.appendChild(cardBody(step, color, onChange));
  else card.appendChild(cardTeaser(step));
  return card;
}

function cardHeader(step, idx, color, expanded, onChange) {
  const head = el('button', {
    cls: 'walk-card-head', type: 'button',
    on: { click: () => { toggleWalkStep(idx); onChange(); } },
  });
  const top = el('div', { cls: 'walk-card-top' });
  top.appendChild(el('span', {
    cls: 'walk-cat-tag',
    style: { color, borderColor: color },
    text: step.category,
  }));
  top.appendChild(el('span', { cls: 'walk-step-num', text: String(idx + 1).padStart(2, '0') }));
  top.appendChild(el('span', { cls: 'walk-twirl', text: expanded ? '▾' : '▸' }));
  head.appendChild(top);
  head.appendChild(el('div', { cls: 'walk-step-title', text: step.title }));
  head.appendChild(countsRow(step));
  return head;
}

function countsRow(step) {
  const row = el('div', { cls: 'walk-counts' });
  if (step.files.length) row.appendChild(countPill(step.files.length, 'file'));
  if (step.fns.length) row.appendChild(countPill(step.fns.length, 'fn'));
  if (step.note) row.appendChild(el('span', { cls: 'walk-count-pill walk-count-note', text: 'note' }));
  return row;
}

function countPill(n, label) {
  const pluralized = n === 1 ? label : `${label}s`;
  return el('span', { cls: 'walk-count-pill', text: `${n} ${pluralized}` });
}

function cardTeaser(step) {
  return el('div', { cls: 'walk-card-teaser', text: step.content });
}

function cardBody(step, color, onChange) {
  const body = el('div', { cls: 'walk-card-body-wrap' });
  body.appendChild(el('div', { cls: 'walk-card-body', text: step.content }));
  if (step.files.length) body.appendChild(chipBlock('Files', step.files, color, p => fileChip(p, onChange)));
  if (step.fns.length) body.appendChild(chipBlock('Key functions', step.fns, color, n => fnChip(n, onChange)));
  if (step.note) body.appendChild(noteStrip(step.note));
  return body;
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-icon', text: '🗺️' }),
    el('div', { cls: 'splash-title', text: 'No walkthrough yet' }),
    el('div', { cls: 'splash-sub', text: 'Drop a folder to generate a guided tour of the codebase.' }),
  ]);
}

function chipBlock(title, items, color, makeChip) {
  const wrap = el('div', { cls: 'walk-chip-block' });
  wrap.appendChild(el('div', { cls: 'walk-chip-label', style: { color }, text: title }));
  const row = el('div', { cls: 'chip-row' });
  for (const it of items) row.appendChild(makeChip(it));
  wrap.appendChild(row);
  return wrap;
}

function fileChip(path, onChange) {
  return el('button', {
    cls: 'walk-fn-chip walk-file-chip', type: 'button',
    title: 'Open this file in Trace',
    text: path,
    on: {
      click: () => {
        selectPath(path);
        setFileTraceRoot(path);
        setActiveTab('trace');
        onChange();
      },
    },
  });
}

function fnChip(name, onChange) {
  return el('button', {
    cls: 'walk-fn-chip', type: 'button', text: name,
    on: {
      click: () => {
        const hit = findFn(name);
        if (!hit) return;
        setTraceRoot(hit);
        setActiveTab('trace');
        onChange();
      },
    },
  });
}

function findFn(name) { return STATE.fnByName.get(name) || null; }

function noteStrip(note) {
  return el('div', { cls: 'walk-note', text: note });
}
