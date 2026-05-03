const ENABLED = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('perf') === '1';

export function mark() {
  return ENABLED ? performance.now() : 0;
}

export function measure(label, t0, extra) {
  if (!ENABLED) return;
  const dt = performance.now() - t0;
  console.log(`[perf] ${label} ${dt.toFixed(1)}ms${extra ? ' ' + extra : ''}`);
}
