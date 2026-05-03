import { STATE, hasGitStats } from '../state.js';
import { cxBucket } from '../tabs.js';
import { el } from '../dom.js';
import { renderHotspotsCard } from './hotspots-card.js';

export function renderOverview() {
  if (!STATE.files.length) return splash();
  const grid = el('div', { cls: 'ov-grid' });
  if (hasGitStats()) grid.appendChild(renderHotspotsCard());
  grid.appendChild(card('Lines by file', barRows(linesData(), 'lang')));
  grid.appendChild(card('Functions by file', barRows(fnsData(), 'success')));
  grid.appendChild(card('Complexity by file', barRows(cxData(), 'cx')));
  grid.appendChild(card('Language breakdown', barRows(langData(), 'lang')));
  return grid;
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-icon', text: '📁' }),
    el('div', { cls: 'splash-title', text: 'No project loaded' }),
    el('div', { cls: 'splash-sub', text: 'Drop a folder onto this panel, or use the “Drop repo / files” button in the toolbar.' }),
  ]);
}

function card(title, body) {
  const c = el('div', { cls: 'ov-card' });
  c.appendChild(el('div', { cls: 'ov-title', text: title }));
  c.appendChild(body);
  return c;
}

function barRows(rows, mode) {
  const wrap = el('div', { cls: 'bar-rows' });
  if (!rows.length) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'no data' }));
    return wrap;
  }
  const max = Math.max(...rows.map(r => r.value)) || 1;
  for (const r of rows) wrap.appendChild(barRow(r, max, mode));
  return wrap;
}

function barRow(r, max, mode) {
  const pct = (r.value / max) * 100;
  const fill = el('div', { cls: 'bar-fill', style: { width: pct + '%', background: barColor(r, mode) } });
  const track = el('div', { cls: 'bar-track' }, [fill]);
  return el('div', { cls: 'bar-row' }, [
    el('div', { cls: 'bar-label', text: r.label, title: r.label }),
    track,
    el('div', { cls: 'bar-count', text: r.display ?? String(r.value) }),
  ]);
}

function barColor(r, mode) {
  if (mode === 'lang') return r.color;
  if (mode === 'success') return 'var(--success)';
  if (mode === 'cx') {
    const b = cxBucket(r.value);
    return b === 'high' ? 'var(--danger)' : b === 'mid' ? 'var(--warn)' : 'var(--success)';
  }
  return 'var(--accent)';
}

function linesData() {
  return [...STATE.files]
    .sort((a, b) => b.lineCount - a.lineCount)
    .slice(0, 12)
    .map(f => ({ label: f.name, value: f.lineCount, color: f.langColor }));
}

function fnsData() {
  return [...STATE.files]
    .filter(f => f.fns.length)
    .sort((a, b) => b.fns.length - a.fns.length)
    .slice(0, 12)
    .map(f => ({ label: f.name, value: f.fns.length }));
}

function cxData() {
  return [...STATE.files]
    .sort((a, b) => b.cx - a.cx)
    .slice(0, 12)
    .map(f => ({ label: f.name, value: +f.cx.toFixed(1), display: f.cx.toFixed(1) }));
}

function langData() {
  const m = new Map();
  for (const f of STATE.files) {
    const cur = m.get(f.lang) || { lang: f.lang, color: f.langColor, lines: 0 };
    cur.lines += f.lineCount;
    m.set(f.lang, cur);
  }
  const total = [...m.values()].reduce((s, x) => s + x.lines, 0) || 1;
  return [...m.values()]
    .sort((a, b) => b.lines - a.lines)
    .map(x => ({ label: x.lang, value: x.lines, color: x.color, display: ((x.lines / total) * 100).toFixed(0) + '%' }));
}
