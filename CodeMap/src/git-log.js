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
