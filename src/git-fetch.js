import { shouldSkipPath, parseFile } from './parser.js';
import { newSkipped, noteTooLarge, MAX_BYTES } from './ingest.js';
import { mark, measure } from './perf.js';
import { basename } from './dom.js';

const CONCURRENCY = 8;
export const DEFAULT_MAX_FILES = 500;

// ─── URL parsing ──────────────────────────────────────────────────────────
// Accepts:
//   github.com/owner/repo
//   github.com/owner/repo/tree/branch
//   github.com/owner/repo/tree/branch/sub/dir
//   gitlab.com/group/repo  (group may be nested: foo/bar/repo)
//   gitlab.com/group/repo/-/tree/branch[/sub/dir]
// Strips http(s):// and trailing .git
export function parseRepoUrl(input) {
  if (!input || typeof input !== 'string') return null;
  let s = input.trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, '').replace(/^git@/, '').replace(/\.git$/i, '');
  s = s.replace(/^([^/:]+):/, '$1/'); // git@github.com:owner/repo → github.com/owner/repo
  const parts = s.split('/').filter(Boolean);
  if (parts.length < 3) return null;
  const host = parts[0].toLowerCase();
  if (host === 'github.com' || host === 'www.github.com') {
    const [, owner, repo, kw, ref, ...rest] = parts;
    if (!owner || !repo) return null;
    return {
      host: 'github', owner, repo,
      ref: kw === 'tree' || kw === 'blob' ? ref : null,
      subpath: kw === 'tree' || kw === 'blob' ? rest.join('/') : '',
    };
  }
  if (host === 'gitlab.com' || host === 'www.gitlab.com') {
    // group(s) / repo  [ /-/tree/branch/sub ]
    const dashIdx = parts.indexOf('-');
    let pathParts, ref = null, subpath = '';
    if (dashIdx >= 0) {
      pathParts = parts.slice(1, dashIdx);
      const tail = parts.slice(dashIdx + 1);
      if ((tail[0] === 'tree' || tail[0] === 'blob') && tail[1]) {
        ref = tail[1];
        subpath = tail.slice(2).join('/');
      }
    } else {
      pathParts = parts.slice(1);
    }
    if (pathParts.length < 2) return null;
    const repo = pathParts.pop();
    const owner = pathParts.join('/');
    return { host: 'gitlab', owner, repo, ref, subpath };
  }
  return null;
}

// ─── Fetch entry point ────────────────────────────────────────────────────
export async function fetchRepo(spec, opts = {}) {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const onProgress = opts.onProgress || (() => {});
  const token = (opts.token || '').trim() || null;
  const t0 = mark();

  onProgress({ phase: 'meta' });
  const meta = spec.host === 'github'
    ? await ghMeta(spec, token)
    : await glMeta(spec, token);

  onProgress({ phase: 'tree', ref: meta.ref });
  const allEntries = spec.host === 'github'
    ? await ghTree(spec, meta.ref, token)
    : await glTree(spec, meta.id, meta.ref, token);

  const subPrefix = (spec.subpath || '').replace(/^\/+|\/+$/g, '');
  const inSubpath = p => !subPrefix || p === subPrefix || p.startsWith(subPrefix + '/');
  const filtered = [];
  for (const e of allEntries) {
    if (e.type !== 'blob') continue;
    if (!inSubpath(e.path)) continue;
    if (shouldSkipPath(e.path)) continue;
    filtered.push({ path: e.path, size: e.size ?? 0 });
  }

  const truncated = filtered.length > maxFiles;
  const taken = truncated ? filtered.slice(0, maxFiles) : filtered;

  const reportProgress = throttleProgress(onProgress);
  onProgress({ phase: 'files', total: taken.length, done: 0 });

  const skipped = newSkipped();
  const out = [];
  let done = 0;

  await runWithConcurrency(taken, CONCURRENCY, async entry => {
    if (entry.size && entry.size > MAX_BYTES) {
      noteTooLarge(skipped, entry.path, entry.size);
    } else {
      try {
        const src = spec.host === 'github'
          ? await ghBlob(spec, meta.ref, entry.path)
          : await glBlob(meta.id, meta.ref, entry.path, token);
        if (src.length > MAX_BYTES) {
          noteTooLarge(skipped, entry.path, src.length);
        } else {
          const displayPath = subPrefix && entry.path.startsWith(subPrefix + '/')
            ? entry.path.slice(subPrefix.length + 1)
            : entry.path;
          const parsed = parseFile(basename(entry.path), src, displayPath);
          if (parsed) out.push(parsed);
          else skipped.unsupported++;
        }
      } catch (err) {
        skipped.unsupported++;
        console.warn('codemap: blob fetch failed', entry.path, err);
      }
    }
    done++;
    reportProgress({ phase: 'files', total: taken.length, done });
  });

  onProgress({ phase: 'files', total: taken.length, done });
  measure('git-fetch', t0, `host=${spec.host} files=${out.length} truncated=${truncated}`);
  return {
    files: out,
    skipped,
    meta: {
      host: spec.host, owner: spec.owner, repo: spec.repo, ref: meta.ref,
      totalBlobs: filtered.length, fetched: taken.length, truncated,
    },
  };
}

// ─── GitHub ───────────────────────────────────────────────────────────────
function ghHeaders(token) {
  const h = { 'Accept': 'application/vnd.github+json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function ghMeta({ owner, repo, ref }, token) {
  if (ref) return { ref };
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders(token) });
  if (!r.ok) throw new Error(`GitHub: ${r.status} ${r.statusText}${r.status === 403 ? ' (rate limit — try a token)' : ''}`);
  const j = await r.json();
  return { ref: j.default_branch || 'main' };
}

async function ghTree({ owner, repo }, ref, token) {
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, { headers: ghHeaders(token) });
  if (!r.ok) throw new Error(`GitHub tree: ${r.status} ${r.statusText}`);
  const j = await r.json();
  if (j.truncated) console.warn('codemap: GitHub tree response was truncated by the API');
  return j.tree || [];
}

async function ghBlob({ owner, repo }, ref, path) {
  // raw.githubusercontent.com is CORS-friendly, anonymous, and doesn't burn the API rate limit
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`raw blob ${path}: ${r.status}`);
  return r.text();
}

// ─── GitLab ───────────────────────────────────────────────────────────────
function glHeaders(token) {
  return token ? { 'PRIVATE-TOKEN': token } : {};
}

async function glMeta({ owner, repo, ref }, token) {
  const id = encodeURIComponent(`${owner}/${repo}`);
  const r = await fetch(`https://gitlab.com/api/v4/projects/${id}`, { headers: glHeaders(token) });
  if (!r.ok) throw new Error(`GitLab: ${r.status} ${r.statusText}`);
  const j = await r.json();
  return { id: j.id, ref: ref || j.default_branch || 'main' };
}

async function glTree(spec, projectId, ref, token) {
  const out = [];
  const headers = glHeaders(token);
  for (let page = 1; page <= 50; page++) {
    const r = await fetch(`https://gitlab.com/api/v4/projects/${projectId}/repository/tree?recursive=true&per_page=100&page=${page}&ref=${encodeURIComponent(ref)}`, { headers });
    if (!r.ok) throw new Error(`GitLab tree: ${r.status} ${r.statusText}`);
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const e of batch) out.push({ path: e.path, type: e.type === 'tree' ? 'tree' : 'blob' });
    if (batch.length < 100) break;
  }
  return out;
}

async function glBlob(projectId, ref, path, token) {
  const r = await fetch(`https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`, { headers: glHeaders(token) });
  if (!r.ok) throw new Error(`GitLab blob ${path}: ${r.status}`);
  return r.text();
}

// ─── Utility ──────────────────────────────────────────────────────────────
function throttleProgress(fn, intervalMs = 80) {
  let last = 0;
  return event => {
    const now = performance.now();
    if (now - last < intervalMs) return;
    last = now;
    fn(event);
  };
}

async function runWithConcurrency(items, n, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}
