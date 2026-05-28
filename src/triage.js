// Persistent smell triage. Stores dismissal state in localStorage keyed by
// repo identity. Pure helpers here; STATE plumbing lives in state.js.

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Stable across line shifts: includes file/kind/subkind/snippet excerpt only.
// Editing code above a finding shifts its line number but must not un-dismiss
// it. The 80-char snippet excerpt disambiguates multiple findings of the same
// kind in the same file.
export function dismissKey(smell) {
  const file = smell.file || '';
  const kind = smell.kind || '';
  const subkind = smell.subkind || '';
  const snippet = (smell.snippet || '').slice(0, 80);
  return djb2(`${file}|${kind}|${subkind}|${snippet}`);
}

export function repoIdentity(state) {
  const m = state && state.lastRepoMeta;
  if (m && m.host && m.owner && m.repo) {
    return `git:${m.host}/${m.owner}/${m.repo}@${m.ref || ''}`;
  }
  const files = (state && state.files) || [];
  if (!files.length) return null;
  const rootName = files[0].path.split('/')[0] || files[0].path;
  const sorted = files.map(f => f.path).sort();
  return `local:${rootName}:${djb2(sorted.join('\n'))}`;
}

const STORAGE_PREFIX = 'codemap:triage:';
const STORAGE_VERSION = 1;

function storageKey(repoId) {
  return repoId ? `${STORAGE_PREFIX}${repoId}` : null;
}

function safeGet(key) {
  if (!key) return null;
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function safeSet(key, value) {
  if (!key) return false;
  try { localStorage.setItem(key, value); return true; }
  catch (e) {
    console.warn('codemap: localStorage write failed', e);
    return false;
  }
}

function safeRemove(key) {
  if (!key) return;
  try { localStorage.removeItem(key); } catch {}
}

export function loadDismissed(repoId) {
  const raw = safeGet(storageKey(repoId));
  if (!raw) return new Set();
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return new Set(); }
  if (!parsed || !Array.isArray(parsed.dismissed)) return new Set();
  return new Set(parsed.dismissed.filter(x => typeof x === 'string'));
}

export function saveDismissed(repoId, set) {
  const key = storageKey(repoId);
  if (!key) return;
  const payload = {
    version: STORAGE_VERSION,
    repoId,
    dismissed: [...set].sort(),
    updatedAt: new Date().toISOString(),
  };
  safeSet(key, JSON.stringify(payload));
}

export function clearStoredTriage(repoId) {
  safeRemove(storageKey(repoId));
}

export function triageExportPayload(repoId, set) {
  return {
    version: STORAGE_VERSION,
    repoId: repoId || null,
    dismissed: [...set].sort(),
    updatedAt: new Date().toISOString(),
  };
}

export function parseTriageImport(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { return { ok: false, error: 'invalid JSON' }; }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'not an object' };
  }
  if (parsed.version !== STORAGE_VERSION) {
    return { ok: false, error: `unsupported version: ${parsed.version}` };
  }
  if (!Array.isArray(parsed.dismissed)) {
    return { ok: false, error: 'missing dismissed array' };
  }
  return {
    ok: true,
    repoId: parsed.repoId || null,
    dismissed: new Set(parsed.dismissed.filter(x => typeof x === 'string')),
  };
}
