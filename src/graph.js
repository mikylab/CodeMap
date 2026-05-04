// Pure layout / edge computation + canvas renderer for the dependency graph.

const ACCENT = '#3B8BD4';

export function computeLayout(files, W, H) {
  const N = files.length;
  if (!N) return [];
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.max(0, Math.min(W, H) * 0.33);
  const out = new Array(N);
  for (let i = 0; i < N; i++) {
    const f = files[i];
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    out[i] = {
      path: f.path,
      x: cx + R * Math.cos(angle),
      y: cy + R * Math.sin(angle),
      r: 8 + Math.sqrt((f.lineCount || 0) / 30),
    };
  }
  return out;
}

export function computeEdges(files, libToPaths = null) {
  if (!libToPaths) {
    libToPaths = new Map();
    for (const f of files) {
      for (const im of f.imports) {
        let s = libToPaths.get(im.lib);
        if (!s) libToPaths.set(im.lib, s = new Set());
        s.add(f.path);
      }
    }
  }
  const out = [];
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i], b = files[j];
      const sharedLibs = [];
      for (const im of a.imports) {
        const s = libToPaths.get(im.lib);
        if (s && s.has(b.path)) sharedLibs.push(im.lib);
      }
      const sharedLang = a.lang === b.lang;
      if (!sharedLibs.length && !sharedLang) continue;
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

export function prepareGraph(files, W, H, libToPaths = null) {
  const layout = computeLayout(files, W, H);
  const edges = computeEdges(files, libToPaths);
  const adj = buildAdjacency(edges);
  return { layout, edges, adj };
}

export function renderGraph(canvas, files, prepared, opts = {}) {
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
  if (!files.length || !prepared) return;

  const { layout, edges, adj } = prepared;
  const posByPath = new Map(layout.map(p => [p.path, p]));
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const focus = opts.hoveredPath || opts.selectedPath || null;
  const neighbors = focus ? (adj.get(focus) || new Set()) : null;

  for (const e of edges) {
    const a = posByPath.get(e.a), b = posByPath.get(e.b);
    if (!a || !b) continue;
    const touchesFocus = focus && (e.a === focus || e.b === focus);
    const style = edgeStyle(e, focus, touchesFocus, isDark);
    ctx.lineWidth = style.lw;
    ctx.strokeStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const labelColor = isDark ? '#c2c0b6' : '#3d3d3a';
  ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < layout.length; i++) {
    const pos = layout[i];
    const f = files[i];
    const isFocus = focus === pos.path;
    const isNeighbor = neighbors?.has(pos.path);
    ctx.globalAlpha = (focus && !isFocus && !isNeighbor) ? 0.25 : 1;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.r, 0, 2 * Math.PI);
    ctx.fillStyle = (f.langColor || '#888') + (isFocus ? 'ee' : 'cc');
    ctx.fill();
    ctx.lineWidth = isFocus ? 2 : 1;
    ctx.strokeStyle = isFocus ? ACCENT : (f.langColor || '#888');
    ctx.stroke();

    ctx.fillStyle = isFocus ? ACCENT : labelColor;
    ctx.fillText(truncate(f.name, 10), pos.x, pos.y + pos.r + 4);
  }
  ctx.globalAlpha = 1;
}

function edgeStyle(e, focus, touchesFocus, isDark) {
  const isImport = e.kind === 'import';
  if (touchesFocus) {
    return {
      lw: isImport ? 1.6 : 1.0,
      color: rgba(ACCENT, isImport ? 0.95 : 0.55),
    };
  }
  if (focus) {
    return { lw: 0.6, color: rgba(isDark ? '#64625a' : '#96948c', 0.05) };
  }
  if (isImport) {
    return { lw: 1.0, color: rgba(isDark ? '#7aa6c9' : ACCENT, 0.55) };
  }
  return { lw: 0.6, color: rgba(isDark ? '#64625a' : '#96948c', 0.12) };
}

function rgba(hex, alpha) {
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
