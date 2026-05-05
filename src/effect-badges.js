// Phase 9a UI helpers — render effect tags as DOM badges.
//
// Direct tags render as solid pills; inherited tags as outlined pills.
// `dashedTags` (a Set of inherited tags whose only justification is a
// low-confidence call edge) render with a dashed border instead of solid.

import { EFFECT_TAGS } from './effects-config.js';
import { el } from './dom.js';

export function effectBadges(entry, opts = {}) {
  // entry: { direct: Set, inherited: Set } — may be null/undefined.
  const row = el('span', { cls: 'effect-row' });
  if (!entry) return row;
  const dashed = opts.dashed instanceof Set ? opts.dashed : null;
  for (const tag of EFFECT_TAGS) {
    if (entry.direct.has(tag)) {
      row.appendChild(el('span', {
        cls: `effect-badge direct effect-${tag}`,
        text: tag,
        title: `directly performs ${tag}`,
      }));
    } else if (entry.inherited.has(tag)) {
      const cls = dashed && dashed.has(tag) ? 'dashed' : 'inherited';
      row.appendChild(el('span', {
        cls: `effect-badge ${cls} effect-${tag}`,
        text: tag,
        title: `transitively performs ${tag} via callees${cls === 'dashed' ? ' (low-confidence path)' : ''}`,
      }));
    }
  }
  return row;
}

// Compact 6-slot strip used by the sidebar — one rect per tag, fully on
// for direct, dim for inherited, faint background for absent.
export function effectStrip(entry) {
  const strip = el('div', { cls: 'fx-strip' });
  for (const tag of EFFECT_TAGS) {
    let cls = 'fx-slot';
    let style = null;
    if (entry && entry.direct && entry.direct.has(tag)) {
      cls += ' on';
      style = { background: colorFor(tag) };
    } else if (entry && entry.inherited && entry.inherited.has(tag)) {
      cls += ' inh';
      style = { background: colorFor(tag) };
    }
    strip.appendChild(el('div', { cls, title: tag, style }));
  }
  return strip;
}

function colorFor(tag) {
  const map = { net: '#4d8df0', fs: '#e08a3c', db: '#a874e0', exec: '#e0584d', dom: '#4dbf7a', env: '#c8a93a' };
  return map[tag] || '#888';
}

export function hasAnyTag(entry) {
  if (!entry) return false;
  return entry.direct.size > 0 || entry.inherited.size > 0;
}
