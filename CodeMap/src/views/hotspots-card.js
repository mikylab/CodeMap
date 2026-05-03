import { STATE } from '../state.js';
import { topHotspots, riskBucket } from '../risk.js';
import { el, basename } from '../dom.js';

export function renderHotspotsCard() {
  const card = el('div', { cls: 'ov-card hotspots-card' });
  card.appendChild(el('div', { cls: 'ov-title', text: 'Hotspots — risk = complexity × churn' }));
  const now = Date.now();
  const rows = topHotspots(STATE, 10, now);
  if (!rows.length) {
    card.appendChild(el('div', { cls: 'sb-empty', text: 'no overlap between repo and git history' }));
    return card;
  }
  const list = el('div', { cls: 'hotspot-rows' });
  for (const r of rows) list.appendChild(hotspotRow(r, now));
  card.appendChild(list);
  return card;
}

function hotspotRow({ file, stats, risk }, now) {
  const bucket = riskBucket(risk);
  const fill = el('div', {
    cls: `bar-fill hotspot-bar-${bucket}`,
    style: { width: ((risk / 10) * 100).toFixed(1) + '%' },
  });
  const track = el('div', { cls: 'bar-track' }, [fill]);
  const meta = `cx ${file.cx.toFixed(1)} · ${stats.commits} commit${stats.commits === 1 ? '' : 's'} · ${formatAge(stats.lastTouched, now)}`;
  return el('div', { cls: 'hotspot-row' }, [
    el('div', { cls: 'hotspot-label', text: basename(file.path), title: file.path }),
    track,
    el('div', { cls: 'hotspot-score', text: risk.toFixed(1) }),
    el('div', { cls: 'hotspot-meta', text: meta }),
  ]);
}

function formatAge(lastTouchedSec, now) {
  if (!lastTouchedSec) return 'unknown';
  const days = Math.max(0, Math.floor((now - lastTouchedSec * 1000) / 86_400_000));
  if (days === 0) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
