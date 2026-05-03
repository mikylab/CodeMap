// Pure layout / edge computation + canvas renderer for the dependency graph.
// Files are placed on a circle. Edges connect files that share an external
// import or share the same language. Determinism: input order = output order.

export function computeLayout(files, W, H) {
  const N = files.length;
  if (!N) return [];
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.max(0, Math.min(W, H) * 0.33);
  const out = [];
  for (let i = 0; i < N; i++) {
    const f = files[i];
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    out.push({
      path: f.path,
      x: cx + R * Math.cos(angle),
      y: cy + R * Math.sin(angle),
      r: 8 + Math.sqrt((f.lineCount || 0) / 30),
    });
  }
  return out;
}

export function computeEdges(files) {
  const out = [];
  const seen = new Set();
  const libIndex = new Map(); // lib -> Set<path>
  for (const f of files) {
    for (const im of f.imports) {
      let s = libIndex.get(im.lib);
      if (!s) libIndex.set(im.lib, s = new Set());
      s.add(f.path);
    }
  }
  // Edge if files share any external import
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i], b = files[j];
      let connected = false;
      // shared import
      for (const im of a.imports) {
        const s = libIndex.get(im.lib);
        if (s && s.has(b.path)) { connected = true; break; }
      }
      // or same language
      if (!connected && a.lang === b.lang) connected = true;
      if (!connected) continue;
      const key = `${a.path}|${b.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: a.path, b: b.path });
    }
  }
  return out;
}

export function renderGraph(canvas, files) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || canvas.parentElement?.clientWidth || 600;
  const H = canvas.clientHeight || 400;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  if (!files.length) return { layout: [], edges: [] };

  const layout = computeLayout(files, W, H);
  const edges = computeEdges(files);
  const posByPath = new Map(layout.map(p => [p.path, p]));
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // edges first, low-alpha
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = isDark ? 'rgba(100, 98, 90, 0.20)' : 'rgba(150, 148, 140, 0.20)';
  for (const e of edges) {
    const a = posByPath.get(e.a), b = posByPath.get(e.b);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // nodes + labels
  const labelColor = isDark ? '#c2c0b6' : '#3d3d3a';
  ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < layout.length; i++) {
    const pos = layout[i];
    const f = files[i];
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.r, 0, 2 * Math.PI);
    ctx.fillStyle = (f.langColor || '#888') + 'cc';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = f.langColor || '#888';
    ctx.stroke();

    ctx.fillStyle = labelColor;
    ctx.fillText(truncate(f.name, 10), pos.x, pos.y + pos.r + 4);
  }
  return { layout, edges };
}

export function hitTest(layout, x, y) {
  for (let i = layout.length - 1; i >= 0; i--) {
    const p = layout[i];
    const dx = x - p.x, dy = y - p.y;
    if (dx * dx + dy * dy <= (p.r + 2) * (p.r + 2)) return p;
  }
  return null;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
