// Persist a small slice of STATE into location.hash so:
//  - Reload preserves the current view.
//  - Browser back/forward moves between views (no extra history entries —
//    we use replaceState; explicit Codemap history still drives back-button
//    navigation via STATE.history).
//  - Sharing a URL works for repos loaded via the git-URL flow.
//
// Encoded fields (all URL-encoded):
//   repo=<host>/<owner>/<name>@<ref>   (only for git-URL loads)
//   file=<path>
//   fn=<fnKey-or-name>
//   doc=<path>
//   overlay=walk|graph|smells|lineage
//   walk=<step-index>
//   branch=<branch-name>

import {
  STATE, setFullscreen, selectFile, selectFn, selectDoc, clearSelection,
  setSelectedLineageBranch, setWalkIdx, setPendingHashParts,
} from './state.js';
import { fnKey } from './trace-graph.js';

const VALID_OVERLAYS = new Set(['walk', 'graph', 'smells', 'lineage', 'docs']);

let suppressNextHashChange = false;
let lastWrittenHash = '';

export function serializeState() {
  const parts = [];
  if (STATE.lastRepoMeta) {
    const m = STATE.lastRepoMeta;
    parts.push(['repo', `${m.host}/${m.owner}/${m.repo}@${m.ref}`]);
  }
  const pend = STATE.pendingHashParts || {};
  if (STATE.selectedDoc) parts.push(['doc', STATE.selectedDoc]);
  else if (STATE.selectedFnKey) {
    const fn = STATE.fnByKey.get(STATE.selectedFnKey);
    if (fn) parts.push(['fn', `${fn.file}#${fn.name}@${fn.lineNum}`]);
  } else if (STATE.selectedPath) {
    parts.push(['file', STATE.selectedPath]);
  } else if (pend.doc) parts.push(['doc', pend.doc]);
  else if (pend.fn) parts.push(['fn', pend.fn]);
  else if (pend.file) parts.push(['file', pend.file]);
  if (STATE.fullscreen) parts.push(['overlay', STATE.fullscreen]);
  if (STATE.fullscreen === 'walk' && STATE.walkIdx) parts.push(['walk', String(STATE.walkIdx)]);
  if (STATE.fullscreen === 'lineage' && STATE.selectedLineageBranch) {
    parts.push(['branch', STATE.selectedLineageBranch]);
  }
  return parts.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

export function parseHash(hash) {
  const s = String(hash || '').replace(/^#/, '');
  if (!s) return {};
  const out = {};
  for (const pair of s.split('&')) {
    const i = pair.indexOf('=');
    if (i < 0) continue;
    const k = pair.slice(0, i);
    const v = decodeURIComponent(pair.slice(i + 1));
    out[k] = v;
  }
  return out;
}

// Apply the hash to STATE. Does NOT trigger the git-URL auto-fetch — that's
// handled in `bootstrapFromHash` so the caller controls when it happens.
export function applyHash(hash) {
  const h = parseHash(hash);
  const pending = {};
  // Selection: reset first, then apply whichever field is present. If the
  // referenced entity isn't in this STATE (different repo, casing mismatch,
  // file filtered out) we stash the raw value in pendingHashParts so the
  // shared link survives the next writeHash.
  clearSelection();
  if (h.doc) {
    if (STATE.docs.some(d => d.path === h.doc)) selectDoc(h.doc);
    else pending.doc = h.doc;
  } else if (h.fn) {
    const m = h.fn.match(/^(.+)#([^@]+)(?:@(\d+))?$/);
    let resolved = null;
    if (m) {
      const [, file, name, ln] = m;
      const key = fnKey({ name, file, lineNum: ln ? parseInt(ln, 10) : 0 });
      resolved = STATE.fnByKey.get(key) || STATE.fnByName.get(name) || null;
    }
    if (resolved) selectFn(resolved);
    else pending.fn = h.fn;
  } else if (h.file) {
    if (STATE.byPath.has(h.file)) selectFile(h.file);
    else pending.file = h.file;
  }
  // Overlay: validate against the known set so junk values can't render a
  // 'undefined'-titled empty panel. Absent → close any existing overlay.
  if (h.overlay && VALID_OVERLAYS.has(h.overlay)) {
    if (h.overlay === 'lineage' && !STATE.lineage) setFullscreen(null);
    else if (h.overlay === 'docs' && !STATE.docs.length) setFullscreen(null);
    else setFullscreen(h.overlay);
  } else {
    setFullscreen(null);
  }
  if (h.walk) {
    const n = parseInt(h.walk, 10);
    if (Number.isFinite(n)) setWalkIdx(n);
  } else setWalkIdx(0);
  setSelectedLineageBranch(h.branch || null);
  setPendingHashParts(pending);
}

// Read repo= from the hash. Returns { host, owner, repo, ref } or null.
export function repoFromHash(hash) {
  const h = parseHash(hash);
  if (!h.repo) return null;
  const m = h.repo.match(/^([^/]+)\/([^/]+)\/([^@]+)(?:@(.+))?$/);
  if (!m) return null;
  return { host: m[1], owner: m[2], repo: m[3], ref: m[4] || null };
}

// Wipe the URL fragment entirely. Used by the toolbar Clear button so the
// next page reload starts from the empty drop-zone state instead of
// re-hydrating from a stale `repo=`/`file=` hash.
export function clearHash() {
  lastWrittenHash = '';
  suppressNextHashChange = true;
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    location.hash = '';
  }
  suppressNextHashChange = false;
}

export function writeHash() {
  // Don't clobber an incoming hash before any data is loaded — otherwise the
  // very first renderAll() (with empty STATE) wipes file=/fn=/overlay= fields
  // out of the URL before bootstrap or a folder-drop can apply them.
  if (!STATE.files.length && !STATE.docs.length) return;
  const next = '#' + serializeState();
  if (next === lastWrittenHash) return;
  lastWrittenHash = next;
  suppressNextHashChange = true;
  try {
    history.replaceState(null, '', next === '#' ? location.pathname + location.search : next);
  } catch {
    location.hash = next;
  }
  // hashchange does not fire for replaceState; clear the flag immediately.
  suppressNextHashChange = false;
}

// Install listeners. `onHashApplied` is called after applying so the caller
// can re-render.
export function installHashSync(onHashApplied) {
  window.addEventListener('hashchange', () => {
    if (suppressNextHashChange) { suppressNextHashChange = false; return; }
    applyHash(location.hash);
    onHashApplied();
  });
}
