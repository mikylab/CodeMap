// Branch-lineage parser.
//
// Looks for a markdown heading matching `### Branch lineage` (any heading
// level 2-4) in a captured doc, extracts the hand-drawn ASCII tree of
// stacked branches, and associates the prose paragraphs that follow with
// the nodes they mention.
//
// Pure: docs in, { source, docPath, nodes } out. No DOM, no side effects.

const HEAD_RE = /^(#{2,4})\s+branch\s+lineage\b/im;

// Recognized box-drawing/connector characters that precede a branch name.
const CONNECTORS = ['└─', '├─', '└', '├', '|—', '|-'];

export function parseLineage(docs) {
  if (!docs || !docs.length) return null;
  for (const d of docs) {
    const lineage = parseFromDoc(d);
    if (lineage) return lineage;
  }
  return null;
}

function parseFromDoc(doc) {
  const raw = doc && doc.raw;
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(HEAD_RE);
  if (!m) return null;
  const headLevel = m[1].length;
  const start = m.index + m[0].length;
  const rest = raw.slice(start);

  // Find the end of the section: next heading of level <= headLevel.
  const endRe = new RegExp(`^#{1,${headLevel}}\\s`, 'm');
  const endMatch = rest.match(endRe);
  const block = endMatch ? rest.slice(0, endMatch.index) : rest;

  const nodes = extractTree(block);
  if (!nodes.length) return null;
  attachProse(nodes, block);
  return {
    source: /readme/i.test(doc.name || '') ? 'readme' : 'doc',
    docPath: doc.path,
    nodes,
  };
}

// ─── Tree extraction ──────────────────────────────────────────────────────
function extractTree(block) {
  // Find lines inside the section that look like tree rows: contain a
  // connector or a leading-only branch-name pattern (root of the tree).
  // Accept lines from inside code fences OR raw lines.
  const lines = block.split('\n');
  const candidate = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (isTreeLine(line) || (inFence && /\S/.test(line))) candidate.push(line);
    else if (inFence) candidate.push(line);
  }
  if (!candidate.length) return [];

  // Determine the minimum indent so depth=0 starts at the shallowest row.
  // We measure indent in characters from the start of the line up to the
  // first non-whitespace / non-connector character.
  const rows = candidate
    .map(parseRow)
    .filter(Boolean);
  if (!rows.length) return [];
  // Map distinct column positions to depths by rank — robust to mixed indent
  // schemes (e.g. 2-space root, 5-space children).
  const uniqueCols = [...new Set(rows.map(r => r.col))].sort((a, b) => a - b);
  const colToDepth = new Map(uniqueCols.map((c, i) => [c, i]));
  for (const r of rows) r.depth = colToDepth.get(r.col) || 0;
  return rows.map(r => ({
    branch: r.branch,
    depth: r.depth,
    shortNote: r.shortNote,
    longNote: '',
    markers: r.markers,
    github: null,
  }));
}

function isTreeLine(line) {
  if (!line || !line.trim()) return false;
  for (const c of CONNECTORS) if (line.includes(c)) return true;
  // Allow a "root" line that's just a backticked branch name (no connector)
  // when it's the first non-empty line of a code-fence block; handled in
  // extractTree by including fence-internal lines.
  return false;
}

function parseRow(line) {
  // Find the connector position (column).
  let col = 0;
  let after = line;
  let used = null;
  for (const c of CONNECTORS) {
    const i = line.indexOf(c);
    if (i >= 0 && (used == null || i < col)) {
      col = i;
      used = c;
    }
  }
  if (used != null) {
    after = line.slice(col + used.length);
  } else {
    // Root line: branch name at the start of the line (possibly inside a fence).
    const m = line.match(/^(\s*)`?([\w./-]+)`?(.*)$/);
    if (!m) return null;
    col = m[1].length;
    after = '`' + m[2] + '`' + m[3];
  }

  // Parse branch name + trailing note + markers from `after`.
  const trimmed = after.replace(/^[\s─–—-]+/, '');
  // Branch is the first backticked identifier or the first whitespace-delimited token.
  const tickMatch = trimmed.match(/^`([^`]+)`/);
  let branch;
  let tail;
  if (tickMatch) {
    branch = tickMatch[1].trim();
    tail = trimmed.slice(tickMatch[0].length);
  } else {
    const tokMatch = trimmed.match(/^([\w./-]+)/);
    if (!tokMatch) return null;
    branch = tokMatch[1].trim();
    tail = trimmed.slice(tokMatch[0].length);
  }
  if (!branch || !/[\w]/.test(branch)) return null;

  const markers = [];
  if (/←\s*main/i.test(tail) || /<-\s*main/i.test(tail)) markers.push('main-here');
  if (/←\s*active/i.test(tail) || /<-\s*active/i.test(tail)) markers.push('active');

  // Short note: text between branch and any "← ..." marker, or the rest of the line.
  const noteMatch = tail.match(/^[\s—–-]*([^←]*?)(?:\s*←.*)?$/);
  let shortNote = noteMatch ? noteMatch[1].trim() : tail.trim();
  // Strip surrounding parens.
  shortNote = shortNote.replace(/^\(/, '').replace(/\)$/, '').trim();

  return { col, branch, shortNote, markers };
}

// ─── Prose attachment ─────────────────────────────────────────────────────
function attachProse(nodes, block) {
  // Walk the block paragraph-by-paragraph (outside code fences). For each
  // paragraph, find all backticked branch names; attach to the first
  // matching node by appending (with a separator) to longNote.
  const paragraphs = paragraphsOutsideFences(block);
  const byName = new Map(nodes.map(n => [n.branch, n]));
  for (const p of paragraphs) {
    const mentioned = new Set();
    for (const m of p.matchAll(/`([^`]+)`/g)) {
      const name = m[1].trim();
      if (byName.has(name)) mentioned.add(name);
    }
    for (const name of mentioned) {
      const node = byName.get(name);
      node.longNote = node.longNote ? `${node.longNote}\n\n${p}` : p;
    }
  }
}

function paragraphsOutsideFences(block) {
  const out = [];
  let buf = [];
  let inFence = false;
  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) out.push(text);
    buf = [];
  };
  for (const line of block.split('\n')) {
    if (/^\s*```/.test(line)) { flush(); inFence = !inFence; continue; }
    if (inFence) continue;
    if (!line.trim()) { flush(); continue; }
    // Skip tree rows inside the body — they aren't prose.
    if (isTreeLine(line)) { flush(); continue; }
    buf.push(line);
  }
  flush();
  return out;
}
