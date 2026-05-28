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
