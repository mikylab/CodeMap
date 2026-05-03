// Pure risk scoring. `risk = clamp(complexity-weight × log10(commits+1) × recency, 0, 10)`.

export function computeRisk(file, stats, now = Date.now()) {
  if (!file || !stats || !stats.commits) return 0;
  const base = (file.cx / 10) * Math.log10(stats.commits + 1);
  const daysSince = (now - stats.lastTouched * 1000) / 86_400_000;
  const recency = 1 + Math.max(0, 1 - daysSince / 90);
  return clamp(base * recency, 0, 10);
}

export function topHotspots(state, n = 10, now = Date.now()) {
  const out = [];
  for (const f of state.files) {
    const stats = state.gitStatsByPath[f.path];
    if (!stats) continue;
    const risk = computeRisk(f, stats, now);
    out.push({ file: f, stats, risk });
  }
  out.sort((a, b) => b.risk - a.risk || b.stats.commits - a.stats.commits);
  return out.slice(0, n);
}

export function riskBucket(risk) {
  if (risk >= 6) return 'high';
  if (risk >= 3) return 'mid';
  return 'low';
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
