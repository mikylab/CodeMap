// One-shot GitHub branch enrichment for lineage nodes. Called after
// ingest when the repo was loaded via the git-URL path and the lineage
// parser found a tree. Mutates `lineage.nodes[i].github` in-place. Returns
// true when any node was changed so the caller can re-render.

const TOKEN_STORAGE_KEY = 'codemap.gh.token';

export async function enrichLineageFromGitHub(lineage, meta) {
  if (!lineage || !lineage.nodes.length) return false;
  if (!meta || meta.host !== 'github') return false;
  const headers = { 'Accept': 'application/vnd.github+json' };
  const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const branches = await fetchAllBranches(meta.owner, meta.repo, headers);
  const byName = new Map(branches.map(b => [b.name, b]));
  let changed = false;
  for (const node of lineage.nodes) {
    const b = byName.get(node.branch);
    if (b) {
      node.github = {
        exists: true,
        sha: b.commit && b.commit.sha || null,
        protected: !!b.protected,
        url: `https://github.com/${meta.owner}/${meta.repo}/tree/${encodeURIComponent(node.branch)}`,
      };
    } else {
      node.github = {
        exists: false,
        sha: null,
        protected: false,
        url: null,
      };
    }
    changed = true;
  }
  return changed;
}

async function fetchAllBranches(owner, repo, headers) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100&page=${page}`;
    const r = await fetch(url, { headers });
    if (!r.ok) {
      if (r.status === 403) {
        console.warn('codemap: GitHub rate-limited while fetching branches; skipping enrichment');
        return out;
      }
      throw new Error(`GitHub branches: ${r.status}`);
    }
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}
