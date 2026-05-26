// Minimal, in-tree markdown → DOM renderer.
//
// Supports: ATX headings, paragraphs, ordered + unordered lists (single level
// + simple nested), inline code, fenced code, links, blockquotes, bold/italic,
// horizontal rules. No tables. No syntax highlighting in v1.
//
// Safety: all text reaches the DOM via textContent / createTextNode. No
// innerHTML is used for user-controlled strings.

import { el } from './dom.js';

const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_HR      = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const RE_OLI     = /^(\s*)(\d+)\.\s+(.*)$/;
const RE_ULI     = /^(\s*)([-*+])\s+(.*)$/;
const RE_BQ      = /^>\s?(.*)$/;
const RE_FENCE   = /^\s*```(.*)$/;

// Each rendered top-level block produced by this module also carries a
// `data-md-section` attribute on heading nodes so callers (e.g. doc-render's
// lineage swap) can find sections by heading text without parsing twice.

export function renderMarkdown(src) {
  const wrap = el('div', { cls: 'md' });
  if (!src || typeof src !== 'string') return wrap;
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip.
    if (!line.trim()) { i++; continue; }

    // Fenced code.
    const fence = line.match(RE_FENCE);
    if (fence) {
      const lang = fence[1].trim();
      const body = [];
      i++;
      while (i < lines.length && !RE_FENCE.test(lines[i])) {
        body.push(lines[i]); i++;
      }
      if (i < lines.length) i++; // closing fence
      const pre = el('pre', { cls: 'md-pre' });
      const code = el('code', { cls: lang ? `md-code lang-${cssToken(lang)}` : 'md-code' });
      code.textContent = body.join('\n');
      pre.appendChild(code);
      wrap.appendChild(pre);
      continue;
    }

    // Heading.
    const h = line.match(RE_HEADING);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const node = el('h' + level, { cls: 'md-h md-h' + level });
      node.setAttribute('data-md-section', text.toLowerCase());
      renderInline(node, text);
      wrap.appendChild(node);
      i++;
      continue;
    }

    // Horizontal rule.
    if (RE_HR.test(line)) {
      wrap.appendChild(el('hr', { cls: 'md-hr' }));
      i++;
      continue;
    }

    // Blockquote — gather consecutive lines.
    if (RE_BQ.test(line)) {
      const buf = [];
      while (i < lines.length && RE_BQ.test(lines[i])) {
        buf.push(lines[i].match(RE_BQ)[1]);
        i++;
      }
      const bq = el('blockquote', { cls: 'md-bq' });
      const inner = renderMarkdown(buf.join('\n'));
      while (inner.firstChild) bq.appendChild(inner.firstChild);
      wrap.appendChild(bq);
      continue;
    }

    // List (ordered or unordered).
    if (RE_OLI.test(line) || RE_ULI.test(line)) {
      const consumed = consumeList(lines, i);
      wrap.appendChild(consumed.node);
      i = consumed.next;
      continue;
    }

    // Paragraph — gather until blank or block marker.
    const buf = [line];
    i++;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) break;
      if (RE_HEADING.test(l) || RE_HR.test(l) || RE_FENCE.test(l) || RE_BQ.test(l) || RE_OLI.test(l) || RE_ULI.test(l)) break;
      buf.push(l);
      i++;
    }
    const p = el('p', { cls: 'md-p' });
    renderInline(p, buf.join(' '));
    wrap.appendChild(p);
  }
  return wrap;
}

function consumeList(lines, start) {
  const first = lines[start];
  const ordered = RE_OLI.test(first);
  const baseIndent = leadingSpaces(first);
  const list = el(ordered ? 'ol' : 'ul', { cls: 'md-list' });
  let i = start;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      // blank line: peek ahead; continue list only if next is a list item at same indent
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length) { i = j; break; }
      const next = lines[j];
      const m2 = next.match(RE_OLI) || next.match(RE_ULI);
      if (!m2 || leadingSpaces(next) !== baseIndent) { i = j; break; }
      i = j; continue;
    }
    const indent = leadingSpaces(l);
    if (indent < baseIndent) break;
    const m = l.match(ordered ? RE_OLI : RE_ULI) || l.match(RE_ULI) || l.match(RE_OLI);
    if (!m || indent !== baseIndent) {
      // Treat lines indented deeper than baseIndent as a nested list
      if (indent > baseIndent && (RE_OLI.test(l) || RE_ULI.test(l))) {
        const nested = consumeList(lines, i);
        if (list.lastChild) list.lastChild.appendChild(nested.node);
        else list.appendChild(nested.node);
        i = nested.next;
        continue;
      }
      // Otherwise treat as continuation text of the previous item.
      if (list.lastChild) {
        list.lastChild.appendChild(document.createTextNode(' '));
        renderInline(list.lastChild, l.trim());
        i++;
        continue;
      }
      break;
    }
    const text = (m[3] != null) ? m[3] : m[2];
    const li = el('li', { cls: 'md-li' });
    renderInline(li, text);
    list.appendChild(li);
    i++;
  }
  return { node: list, next: i };
}

function leadingSpaces(s) {
  const m = s.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

// ─── Inline rendering ────────────────────────────────────────────────────
// Order matters: code first (so its contents aren't re-tokenized for emphasis),
// then links, then bold, then italic. Each pass converts matched ranges to
// element nodes and recurses on the remaining text via the same routine.

export function renderInline(host, text) {
  const tokens = tokenizeInline(text);
  for (const t of tokens) host.appendChild(t);
}

function tokenizeInline(text) {
  const out = [];
  let s = text;
  while (s.length) {
    const m = findFirstInline(s);
    if (!m) { out.push(document.createTextNode(s)); break; }
    if (m.idx > 0) out.push(document.createTextNode(s.slice(0, m.idx)));
    out.push(m.node);
    s = s.slice(m.idx + m.length);
  }
  return out;
}

function findFirstInline(s) {
  const candidates = [
    findCode(s),
    findLink(s),
    findBold(s),
    findItalic(s),
  ].filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.idx - b.idx);
  return candidates[0];
}

function findCode(s) {
  // Backtick inline code. Supports `..` and ``..``.
  const m = s.match(/(`+)([^`]+?)\1/);
  if (!m) return null;
  const idx = m.index;
  const length = m[0].length;
  const node = el('code', { cls: 'md-icode' });
  node.textContent = m[2];
  return { idx, length, node };
}

function findLink(s) {
  // [text](url) — no nested brackets in text.
  const m = s.match(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/);
  if (!m) return null;
  const idx = m.index;
  const length = m[0].length;
  const url = m[2];
  const a = el('a', {
    cls: 'md-a',
    attrs: { href: safeUrl(url), ...(isExternal(url) ? { target: '_blank', rel: 'noopener noreferrer' } : {}) },
    title: m[3] || undefined,
  });
  renderInline(a, m[1]);
  return { idx, length, node: a };
}

function findBold(s) {
  const m = s.match(/\*\*([^*]+?)\*\*/) || s.match(/__([^_]+?)__/);
  if (!m) return null;
  const node = el('strong', { cls: 'md-b' });
  renderInline(node, m[1]);
  return { idx: m.index, length: m[0].length, node };
}

function findItalic(s) {
  // Avoid eating `**` — require a single `*` or `_` not adjacent to another.
  const m = s.match(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/) || s.match(/(^|[^_\w])_([^_\n]+?)_(?!_)/);
  if (!m) return null;
  const lead = m[1] || '';
  const idx = m.index + lead.length;
  const length = m[0].length - lead.length;
  const node = el('em', { cls: 'md-i' });
  renderInline(node, m[2]);
  return { idx, length, node };
}

function isExternal(url) {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('javascript:');
}

function safeUrl(url) {
  // Block javascript: and data: URLs.
  if (/^\s*javascript:/i.test(url) || /^\s*data:/i.test(url) || /^\s*vbscript:/i.test(url)) return '#';
  return url;
}

function cssToken(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9_-]/g, '');
}
