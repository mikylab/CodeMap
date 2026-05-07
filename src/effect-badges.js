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

// Compact effect indicator — one labeled chip per *present* tag.
// Direct effects render filled; inherited render outlined; absent are skipped
// entirely so the row doesn't look like a loading/progress bar.
export function effectStrip(entry) {
  const strip = el('div', { cls: 'fx-strip' });
  if (!entry) return strip;
  for (const tag of EFFECT_TAGS) {
    const isDirect = entry.direct && entry.direct.has(tag);
    const isInherited = !isDirect && entry.inherited && entry.inherited.has(tag);
    if (!isDirect && !isInherited) continue;
    const color = colorFor(tag);
    const chip = el('span', {
      cls: `fx-chip ${isDirect ? 'direct' : 'inherited'} effect-${tag}`,
      title: `${isDirect ? 'directly performs' : 'transitively performs'} ${tag}`,
      style: isDirect
        ? { background: color, borderColor: color, color: '#fff' }
        : { color, borderColor: color },
    });
    chip.appendChild(el('span', { cls: 'fx-chip-icon', text: iconFor(tag) }));
    chip.appendChild(el('span', { cls: 'fx-chip-label', text: labelFor(tag) }));
    if (isInherited) chip.appendChild(el('span', { cls: 'fx-chip-suffix', text: '(via callees)' }));
    strip.appendChild(chip);
  }
  return strip;
}

function colorFor(tag) {
  const map = { net: '#4d8df0', fs: '#e08a3c', db: '#a874e0', exec: '#e0584d', dom: '#4dbf7a', env: '#c8a93a' };
  return map[tag] || '#888';
}

function iconFor(tag) {
  const map = { net: '⇆', fs: '▤', db: '⛃', exec: '▶', dom: '◫', env: '$' };
  return map[tag] || '•';
}

function labelFor(tag) {
  const map = {
    net: 'Network',
    fs: 'Filesystem',
    db: 'Database',
    exec: 'Subprocess',
    dom: 'DOM',
    env: 'Environment',
  };
  return map[tag] || tag;
}

export function hasAnyTag(entry) {
  if (!entry) return false;
  return entry.direct.size > 0 || entry.inherited.size > 0;
}
