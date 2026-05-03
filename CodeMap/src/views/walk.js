import { STATE, setWalkIdx, selectPath, setTraceRoot, setActiveTab } from '../state.js';
import { STEP_COLORS } from '../tabs.js';
import { el } from '../dom.js';

export function renderWalk(onChange) {
  if (!STATE.walk.length) return splash();
  const wrap = el('div', { cls: 'walk-root' });
  const step = STATE.walk[STATE.walkIdx];
  const color = STEP_COLORS()[step.category] || '#888780';
  wrap.appendChild(walkBar(step, onChange));
  wrap.appendChild(progressTrail(onChange));
  wrap.appendChild(walkBody(step, color, onChange));
  return wrap;
}

export function stepWalk(delta, onChange) {
  setWalkIdx(STATE.walkIdx + delta);
  if (onChange) onChange();
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-icon', text: '🗺️' }),
    el('div', { cls: 'splash-title', text: 'No walkthrough yet' }),
    el('div', { cls: 'splash-sub', text: 'Drop a folder to generate a guided tour of the codebase.' }),
  ]);
}

function walkBar(step, onChange) {
  const total = STATE.walk.length;
  const idx = STATE.walkIdx;
  const bar = el('div', { cls: 'walk-bar' });
  bar.appendChild(el('button', {
    cls: 'walk-btn', type: 'button', text: '← prev',
    disabled: idx === 0,
    on: { click: () => { setWalkIdx(idx - 1); onChange(); } },
  }));
  bar.appendChild(el('div', { cls: 'walk-title', text: step.title }));
  bar.appendChild(el('div', { cls: 'walk-counter', text: `${idx + 1} / ${total}` }));
  bar.appendChild(el('button', {
    cls: 'walk-btn primary', type: 'button', text: 'next →',
    disabled: idx >= total - 1,
    on: { click: () => { setWalkIdx(idx + 1); onChange(); } },
  }));
  return bar;
}

function progressTrail(onChange) {
  const trail = el('div', { cls: 'progress-trail' });
  for (let i = 0; i < STATE.walk.length; i++) {
    const s = STATE.walk[i];
    const color = STEP_COLORS()[s.category] || '#888780';
    let cls = 'progress-dot';
    const style = {};
    if (i < STATE.walkIdx) cls += ' done';
    else if (i === STATE.walkIdx) {
      cls += ' current';
      style.background = color; style.borderColor = color;
      style.boxShadow = `0 0 0 2px ${color}40`;
    }
    trail.appendChild(el('div', {
      cls, style, title: s.title,
      on: { click: () => { setWalkIdx(i); onChange(); } },
    }));
  }
  return trail;
}

function walkBody(step, color, onChange) {
  const body = el('div', { cls: 'walk-body' });
  body.appendChild(highlightCard(step, color));
  if (step.files.length) body.appendChild(chipCard('Files in this section', step.files, color, p => fileChip(p, onChange)));
  if (step.fns.length) body.appendChild(chipCard('Key functions', step.fns, color, n => fnChip(n, onChange)));
  if (step.note) body.appendChild(noteStrip(step.note));
  return body;
}

function highlightCard(step, color) {
  const card = el('div', { cls: 'walk-card highlight', style: { borderColor: color } });
  card.appendChild(el('div', { cls: 'walk-card-title', style: { color }, text: step.title }));
  card.appendChild(el('div', { cls: 'walk-card-body', text: step.content }));
  return card;
}

function chipCard(title, items, color, makeChip) {
  const card = el('div', { cls: 'walk-card' });
  card.appendChild(el('div', { cls: 'walk-card-title', style: { color }, text: title }));
  const row = el('div', { cls: 'chip-row' });
  for (const it of items) row.appendChild(makeChip(it));
  card.appendChild(row);
  return card;
}

function fileChip(path, onChange) {
  return el('button', {
    cls: 'walk-fn-chip', type: 'button', text: path,
    on: { click: () => { selectPath(path); onChange(); } },
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

function findFn(name) {
  for (const f of STATE.files) for (const fn of f.fns) if (fn.name === name) return fn;
  return null;
}

function noteStrip(note) {
  return el('div', { cls: 'walk-note', text: note });
}
