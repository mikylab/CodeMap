import { STATE, selectFile, selectFn, exitFullscreen, toggleWalkStep } from '../state.js';
import { STEP_COLORS } from '../tabs.js';
import { el } from '../dom.js';

const CHIP_CAP = 8;

export function renderWalk(onChange) {
  if (!STATE.walk.length) return splash();
  const wrap = el('div', { cls: 'walk-root' });
  wrap.appendChild(viewHint());
  wrap.appendChild(repoScopeBanner());
  wrap.appendChild(layout(onChange));
  return wrap;
}

function viewHint() {
  return el('div', { cls: 'view-hint' }, [
    el('span', { cls: 'view-hint-name', text: 'Walk' }),
    el('span', { text: ' — Guided tour of your repo. Click any card to read its details on the left.' }),
  ]);
}

function repoScopeBanner() {
  const fileCount = STATE.files.length;
  const total = STATE.walk.length;
  const banner = el('div', { cls: 'walk-scope' });
  banner.appendChild(el('span', { cls: 'walk-scope-tag', text: 'REPO TOUR' }));
  banner.appendChild(el('span', {
    cls: 'walk-scope-text',
    text: `${total} sections covering all ${fileCount} file${fileCount === 1 ? '' : 's'}.`,
  }));
  return banner;
}

function selectedIdx() {
  if (!STATE.expandedWalkSteps || !STATE.expandedWalkSteps.size) return null;
  return [...STATE.expandedWalkSteps][0];
}

function layout(onChange) {
  const idx = selectedIdx();
  const root = el('div', { cls: 'walk-layout' });
  root.appendChild(detailPane(idx, onChange));
  root.appendChild(stepGrid(idx, onChange));
  return root;
}

function detailPane(idx, onChange) {
  const pane = el('aside', { cls: 'walk-detail' });
  if (idx == null) {
    pane.appendChild(el('div', { cls: 'walk-detail-empty' }, [
      el('div', { cls: 'walk-detail-empty-icon', text: '←' }),
      el('div', { cls: 'walk-detail-empty-text', text: 'Pick a section from the board to read it here.' }),
    ]));
    return pane;
  }
  const step = STATE.walk[idx];
  const color = STEP_COLORS()[step.category] || '#888780';
  const head = el('div', { cls: 'walk-detail-head', style: { borderTopColor: color } });
  const top = el('div', { cls: 'walk-card-top' });
  top.appendChild(el('span', {
    cls: 'walk-cat-tag',
    style: { color, borderColor: color },
    text: step.category,
  }));
  top.appendChild(el('span', { cls: 'walk-step-num', text: String(idx + 1).padStart(2, '0') + ' / ' + String(STATE.walk.length).padStart(2, '0') }));
  top.appendChild(el('button', {
    cls: 'walk-detail-close', type: 'button', text: '✕',
    title: 'Close this section',
    on: { click: () => { toggleWalkStep(idx); onChange(); } },
  }));
  head.appendChild(top);
  head.appendChild(el('div', { cls: 'walk-step-title', text: step.title }));
  pane.appendChild(head);

  const body = el('div', { cls: 'walk-detail-body' });
  body.appendChild(el('div', { cls: 'walk-card-body', text: step.content }));
  if (step.files.length) body.appendChild(chipBlock('Files', step.files, color, idx, 'files', p => fileChip(p, onChange), onChange));
  if (step.fns.length) body.appendChild(chipBlock('Key functions', step.fns, color, idx, 'fns', n => fnChip(n, onChange), onChange));
  if (step.note) body.appendChild(noteStrip(step.note));
  pane.appendChild(body);
  return pane;
}

function stepGrid(selIdx, onChange) {
  const grid = el('div', { cls: 'walk-grid' });
  STATE.walk.forEach((step, i) => {
    const color = STEP_COLORS()[step.category] || '#888780';
    grid.appendChild(stepCard(step, i, color, i === selIdx, onChange));
  });
  return grid;
}

function stepCard(step, idx, color, selected, onChange) {
  const card = el('div', {
    cls: 'walk-card' + (selected ? ' selected' : ''),
    style: { borderTopColor: color },
  });
  card.appendChild(cardHeader(step, idx, color, onChange));
  card.appendChild(cardTeaser(step));
  return card;
}

function cardHeader(step, idx, color, onChange) {
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

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-icon', text: '🗺️' }),
    el('div', { cls: 'splash-title', text: 'No walkthrough yet' }),
    el('div', { cls: 'splash-sub', text: 'Drop a folder to generate a guided tour of the codebase.' }),
  ]);
}

function chipBlock(title, items, color, stepIdx, slotKey, makeChip, onChange) {
  const wrap = el('div', { cls: 'walk-chip-block' });
  wrap.appendChild(el('div', { cls: 'walk-chip-label', style: { color }, text: `${title} (${items.length})` }));
  const revealKey = `${stepIdx}:${slotKey}`;
  const fullyShown = STATE.walkRevealed && STATE.walkRevealed.has(revealKey);
  const limit = fullyShown ? items.length : CHIP_CAP;
  const visible = items.slice(0, limit);
  const row = el('div', { cls: 'chip-row' });
  for (const it of visible) row.appendChild(makeChip(it));
  wrap.appendChild(row);
  if (items.length > limit) {
    wrap.appendChild(el('button', {
      cls: 'walk-chip-more', type: 'button',
      text: `+ ${items.length - limit} more`,
      on: {
        click: () => {
          if (!STATE.walkRevealed) STATE.walkRevealed = new Set();
          STATE.walkRevealed.add(revealKey);
          onChange();
        },
      },
    }));
  } else if (fullyShown && items.length > CHIP_CAP) {
    wrap.appendChild(el('button', {
      cls: 'walk-chip-more', type: 'button',
      text: 'show fewer',
      on: {
        click: () => {
          STATE.walkRevealed.delete(revealKey);
          onChange();
        },
      },
    }));
  }
  return wrap;
}

function fileChip(path, onChange) {
  return el('button', {
    cls: 'walk-fn-chip walk-file-chip', type: 'button',
    title: 'Open this file in the workspace',
    text: path,
    on: {
      click: () => {
        selectFile(path);
        exitFullscreen();
        onChange();
      },
    },
  });
}

function fnChip(name, onChange) {
  return el('button', {
    cls: 'walk-fn-chip', type: 'button', text: name,
    title: 'Open this function in the workspace',
    on: {
      click: () => {
        const hit = findFn(name);
        if (!hit) return;
        selectFn(hit);
        exitFullscreen();
        onChange();
      },
    },
  });
}

function findFn(name) { return STATE.fnByName.get(name) || null; }

function noteStrip(note) {
  return el('div', { cls: 'walk-note', text: note });
}
