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
  const libIndex = new Map();
  for (const f of files) {
    for (const im of f.imports) {
      let s = libIndex.get(im.lib);
      if (!s) libIndex.set(im.lib, s = new Set());
      s.add(f.path);
    }
  }
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i], b = files[j];
      const sharedLibs = [];
      for (const im of a.imports) {
        const s = libIndex.get(im.lib);
        if (s && s.has(b.path)) sharedLibs.push(im.lib);
      }
      const sharedLang = a.lang === b.lang;
      if (!sharedLibs.length && !sharedLang) continue;
      const key = `${a.path}|${b.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        a: a.path,
        b: b.path,
        kind: sharedLibs.length ? 'import' : 'lang',
        libs: sharedLibs,
      });
    }
  }
  return out;
}

export function buildAdjacency(edges) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, new Set());
    if (!adj.has(e.b)) adj.set(e.b, new Set());
    adj.get(e.a).add(e.b);
    adj.get(e.b).add(e.a);
  }
  return adj;
}

export function renderGraph(canvas, files, opts = {}) {
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
  if (!files.length) return { layout: [], edges: [], adj: new Map() };

  const layout = computeLayout(files, W, H);
  const edges = computeEdges(files);
  const adj = buildAdjacency(edges);
  const posByPath = new Map(layout.map(p => [p.path, p]));
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const hovered = opts.hoveredPath || null;
  const selected = opts.selectedPath || null;
  const focus = hovered || selected;
  const neighbors = focus ? (adj.get(focus) || new Set()) : null;

  // Edges — dim by default, brighter for import edges, brightest when focused.
  for (const e of edges) {
    const a = posByPath.get(e.a), b = posByPath.get(e.b);
    if (!a || !b) continue;
    const touchesFocus = focus && (e.a === focus || e.b === focus);
    let alpha, lw;
    if (touchesFocus) {
      alpha = e.kind === 'import' ? 0.95 : 0.55;
      lw = e.kind === 'import' ? 1.6 : 1.0;
    } else if (focus) {
      alpha = 0.05;
      lw = 0.6;
    } else {
      alpha = e.kind === 'import' ? 0.55 : 0.12;
      lw = e.kind === 'import' ? 1.0 : 0.6;
    }
    ctx.lineWidth = lw;
    ctx.strokeStyle = touchesFocus
      ? edgeColor('#3B8BD4', alpha)              // accent
      : e.kind === 'import'
        ? edgeColor(isDark ? '#7aa6c9' : '#3B8BD4', alpha)
        : edgeColor(isDark ? '#64625a' : '#96948c', alpha);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Nodes
  const labelColor = isDark ? '#c2c0b6' : '#3d3d3a';
  ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < layout.length; i++) {
    const pos = layout[i];
    const f = files[i];
    const isFocus = focus === pos.path;
    const isNeighbor = neighbors?.has(pos.path);
    const dim = focus && !isFocus && !isNeighbor;
    ctx.globalAlpha = dim ? 0.25 : 1;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.r, 0, 2 * Math.PI);
    ctx.fillStyle = (f.langColor || '#888') + (isFocus ? 'ee' : 'cc');
    ctx.fill();
    ctx.lineWidth = isFocus ? 2 : 1;
    ctx.strokeStyle = isFocus ? '#3B8BD4' : (f.langColor || '#888');
    ctx.stroke();

    ctx.fillStyle = isFocus ? '#3B8BD4' : labelColor;
    ctx.fillText(truncate(f.name, 10), pos.x, pos.y + pos.r + 4);
  }
  ctx.globalAlpha = 1;

  return { layout, edges, adj };
}

function edgeColor(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
