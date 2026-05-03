// Lightweight perf logging gated behind ?perf=1 in the URL.
// Emits to console.log when enabled; no-op otherwise.

const ENABLED = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('perf') === '1';

export function perfEnabled() { return ENABLED; }

export function mark(label) {
  return ENABLED ? performance.now() : 0;
}

export function measure(label, t0, extra) {
  if (!ENABLED) return;
  const dt = performance.now() - t0;
  const tail = extra ? ` ${extra}` : '';
  console.log(`[perf] ${label} ${dt.toFixed(1)}ms${tail}`);
}

export async function measureAsync(label, fn, extra) {
  if (!ENABLED) return fn();
  const t0 = performance.now();
  const out = await fn();
  console.log(`[perf] ${label} ${(performance.now() - t0).toFixed(1)}ms${extra ? ' ' + extra : ''}`);
  return out;
}
