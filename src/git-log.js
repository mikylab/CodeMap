// Parse the output of:
//   git log --numstat --pretty=format:'__commit__%n%H%n%aI%n%ae%n%s'
//
// Returns { commits: Commit[], byPath: { [path]: GitStats } }.

const RENAME = /^(.*)\{(.*) => (.*)\}(.*)$/;
const ARROW = /^(.*) => (.*)$/;

export function parseGitLog(text) {
  const commits = [];
  const byPath = Object.create(null);
  if (!text) return { commits, byPath };

  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    if (lines[i] !== '__commit__') { i++; continue; }
    i++;
    const hash = lines[i++] ?? '';
    const dateIso = lines[i++] ?? '';
    const author = lines[i++] ?? '';
    const subject = lines[i++] ?? '';
    if (!hash) continue;
    const ts = Math.floor(Date.parse(dateIso) / 1000) || 0;
    const files = [];
    while (i < lines.length && lines[i] !== '__commit__') {
      const line = lines[i++];
      if (!line) continue;
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const [addRaw, delRaw, ...rest] = parts;
      const path = resolveRename(rest.join('\t'));
      const added = addRaw === '-' ? 0 : parseInt(addRaw, 10) || 0;
      const removed = delRaw === '-' ? 0 : parseInt(delRaw, 10) || 0;
      files.push({ path, added, removed });
      const stat = byPath[path] || (byPath[path] = {
        commits: 0, lastTouched: 0, authors: [], linesAdded: 0, linesRemoved: 0,
        _authorSet: new Set(),
      });
      stat.commits++;
      if (ts > stat.lastTouched) stat.lastTouched = ts;
      stat.linesAdded += added;
      stat.linesRemoved += removed;
      if (author && !stat._authorSet.has(author)) {
        stat._authorSet.add(author);
        stat.authors.push(author);
      }
    }
    commits.push({ hash, ts, author, subject, files });
  }

  for (const path of Object.keys(byPath)) {
    const s = byPath[path];
    s.authors.sort();
    delete s._authorSet;
  }

  return { commits, byPath };
}

function resolveRename(p) {
  // `git log --numstat` rename forms:
  //   "src/{old.js => new.js}"  →  "src/new.js"
  //   "old.js => new.js"        →  "new.js"
  let m = p.match(RENAME);
  if (m) return (m[1] + m[3] + m[4]).replace(/\/\//g, '/');
  m = p.match(ARROW);
  if (m) return m[2];
  return p;
}

export function looksLikeGitLog(text) {
  return typeof text === 'string' && text.startsWith('__commit__\n');
}

export function summarizeGitLog(commits, opts = {}) {
  const empty = {
    totals: { commits: 0, authors: 0, files: 0, firstTs: 0, lastTs: 0, linesAdded: 0, linesRemoved: 0 },
    byAuthor: [], byMonth: [], topPaths: [], recent: [],
  };
  if (!commits || !commits.length) return empty;

  const limit = opts.recent ?? 20;
  const topN = opts.topPaths ?? 10;

  const authors = new Map();
  const months = new Map();
  const paths = new Map();
  let firstTs = Infinity, lastTs = 0, addAll = 0, delAll = 0;

  for (const c of commits) {
    if (c.ts && c.ts < firstTs) firstTs = c.ts;
    if (c.ts > lastTs) lastTs = c.ts;
    const a = authors.get(c.author) || { author: c.author, commits: 0, linesAdded: 0, linesRemoved: 0, lastTs: 0 };
    a.commits++;
    if (c.ts > a.lastTs) a.lastTs = c.ts;
    let cAdd = 0, cDel = 0;
    for (const f of c.files) {
      cAdd += f.added; cDel += f.removed;
      const p = paths.get(f.path) || { path: f.path, commits: 0, linesAdded: 0, linesRemoved: 0, lastTs: 0 };
      p.commits++;
      p.linesAdded += f.added;
      p.linesRemoved += f.removed;
      if (c.ts > p.lastTs) p.lastTs = c.ts;
      paths.set(f.path, p);
    }
    a.linesAdded += cAdd; a.linesRemoved += cDel;
    addAll += cAdd; delAll += cDel;
    authors.set(c.author, a);

    const mKey = monthKey(c.ts);
    if (mKey) {
      const m = months.get(mKey) || { month: mKey, commits: 0, linesAdded: 0, linesRemoved: 0 };
      m.commits++; m.linesAdded += cAdd; m.linesRemoved += cDel;
      months.set(mKey, m);
    }
  }

  return {
    totals: {
      commits: commits.length,
      authors: authors.size,
      files: paths.size,
      firstTs: firstTs === Infinity ? 0 : firstTs,
      lastTs,
      linesAdded: addAll,
      linesRemoved: delAll,
    },
    byAuthor: [...authors.values()].sort((a, b) => b.commits - a.commits || a.author.localeCompare(b.author)),
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    topPaths: [...paths.values()]
      .sort((a, b) => b.commits - a.commits || (b.linesAdded + b.linesRemoved) - (a.linesAdded + a.linesRemoved))
      .slice(0, topN),
    recent: [...commits].sort((a, b) => b.ts - a.ts).slice(0, limit),
  };
}

function monthKey(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
