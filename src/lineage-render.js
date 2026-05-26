// Branch-lineage tree component, shared between the fullscreen overlay
// (compact=false, with side-pane) and inline rendering inside a doc
// (compact=true, no side-pane). The component reads from STATE.lineage and
// STATE.selectedLineageBranch and triggers `onChange` after mutations.

import { STATE, setSelectedLineageBranch } from './state.js';
import { el, clear } from './dom.js';
import { renderMarkdown } from './markdown.js';

export function renderLineageOverlay(onChange) {
  const root = el('div', { cls: 'ln-root' });
  if (!STATE.lineage) {
    root.appendChild(el('div', { cls: 'ln-empty', text: 'No "### Branch lineage" section found in your docs.' }));
    return root;
  }
  const split = el('div', { cls: 'ln-split' });
  const left = el('div', { cls: 'ln-pane ln-pane-tree' });
  renderLineageTree(left, STATE.lineage, { compact: false, onChange });
  const right = el('div', { cls: 'ln-pane ln-pane-detail' });
  renderDetailPane(right);
  split.appendChild(left);
  split.appendChild(right);
  root.appendChild(split);
  return root;
}

export function renderLineageTree(container, lineage, opts = {}) {
  clear(container);
  const onChange = opts.onChange || (() => {});
  const compact = !!opts.compact;
  if (!lineage || !lineage.nodes.length) {
    container.appendChild(el('div', { cls: 'ln-empty', text: 'No lineage nodes parsed.' }));
    return;
  }
  const list = el('div', { cls: 'ln-tree' + (compact ? ' ln-tree-compact' : '') });
  for (const node of lineage.nodes) {
    const card = el('button', {
      cls: 'ln-node' + (STATE.selectedLineageBranch === node.branch ? ' active' : ''),
      type: 'button',
      title: node.branch + (node.shortNote ? ` — ${node.shortNote}` : ''),
      style: { marginLeft: (node.depth * 24) + 'px' },
      on: { click: () => { setSelectedLineageBranch(node.branch); onChange(); } },
    });
    card.appendChild(el('span', { cls: 'ln-node-rail', text: depthRail(node.depth) }));
    card.appendChild(el('span', { cls: 'ln-node-name', text: node.branch }));
    for (const m of node.markers) {
      card.appendChild(el('span', { cls: 'ln-node-marker ln-marker-' + m, text: humanMarker(m) }));
    }
    if (node.github && node.github.exists === false) {
      card.appendChild(el('span', { cls: 'ln-node-marker ln-marker-gone', text: 'gone' }));
    }
    if (node.shortNote) {
      card.appendChild(el('span', { cls: 'ln-node-note', text: node.shortNote }));
    }
    list.appendChild(card);
  }
  container.appendChild(list);
}

function renderDetailPane(host) {
  const branch = STATE.selectedLineageBranch;
  if (!branch || !STATE.lineage) {
    host.appendChild(el('div', { cls: 'ln-detail-empty', text: 'Select a branch to see its description.' }));
    return;
  }
  const node = STATE.lineage.nodes.find(n => n.branch === branch);
  if (!node) {
    host.appendChild(el('div', { cls: 'ln-detail-empty', text: 'Branch not found in lineage.' }));
    return;
  }
  host.appendChild(el('div', { cls: 'ln-detail-title', text: node.branch }));
  if (node.shortNote) host.appendChild(el('div', { cls: 'ln-detail-short', text: node.shortNote }));
  if (node.markers.length) {
    const row = el('div', { cls: 'ln-detail-markers' });
    for (const m of node.markers) row.appendChild(el('span', { cls: 'ln-node-marker ln-marker-' + m, text: humanMarker(m) }));
    host.appendChild(row);
  }
  if (node.github) {
    const gh = node.github;
    const meta = el('div', { cls: 'ln-detail-gh' });
    meta.appendChild(el('span', { cls: 'ln-gh-status', text: gh.exists ? 'on GitHub' : 'missing on GitHub' }));
    if (gh.sha) meta.appendChild(el('span', { cls: 'ln-gh-sha', text: gh.sha.slice(0, 7) }));
    if (gh.url) {
      const a = el('a', {
        cls: 'ln-gh-link',
        text: 'View on GitHub →',
        attrs: { href: gh.url, target: '_blank', rel: 'noopener noreferrer' },
      });
      meta.appendChild(a);
    }
    host.appendChild(meta);
  }
  if (node.longNote) {
    const body = el('div', { cls: 'ln-detail-body' });
    const md = renderMarkdown(node.longNote);
    body.appendChild(md);
    host.appendChild(body);
  } else {
    host.appendChild(el('div', { cls: 'ln-detail-empty', text: 'No long-form description for this branch.' }));
  }
}

function depthRail(depth) {
  if (depth <= 0) return '●';
  return '└─';
}

function humanMarker(m) {
  if (m === 'main-here') return 'main is here';
  if (m === 'active')    return 'active';
  if (m === 'gone')      return 'gone';
  return m;
}
