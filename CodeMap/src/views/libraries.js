import { STATE } from '../state.js';
import { isStdlib } from '../tabs.js';
import { el } from '../dom.js';

export function renderLibraries() {
  if (!STATE.files.length) return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-title', text: 'No libraries yet' }),
    el('div', { cls: 'splash-sub', text: 'Drop a folder to detect external dependencies.' }),
  ]);
  const records = collect();
  if (!records.length) return el('div', { cls: 'sb-empty', text: 'no imports detected' });
  const max = Math.max(...records.map(r => r.count));
  const grid = el('div', { cls: 'lib-grid' });
  for (const r of records) grid.appendChild(card(r, max));
  return grid;
}

function collect() {
  const counts = new Map();
  for (const f of STATE.files) for (const im of f.imports) counts.set(im.lib, (counts.get(im.lib) || 0) + 1);
  return [...counts.entries()]
    .map(([lib, count]) => ({ lib, count, type: isStdlib(lib) ? 'stdlib' : 'external' }))
    .sort((a, b) => b.count - a.count || a.lib.localeCompare(b.lib));
}

function card(r, max) {
  const c = el('div', { cls: 'lib-card' });
  c.appendChild(el('div', { cls: 'lib-name', text: r.lib }));
  c.appendChild(el('div', { cls: 'lib-count', text: `used ${r.count}×` }));
  const fillColor = r.type === 'stdlib' ? '#888780' : 'var(--accent)';
  const fill = el('div', { cls: 'lib-bar-fill', style: { width: ((r.count / max) * 100) + '%', background: fillColor } });
  c.appendChild(el('div', { cls: 'lib-bar' }, [fill]));
  c.appendChild(el('div', { cls: 'lib-type', style: { color: fillColor }, text: r.type }));
  return c;
}
