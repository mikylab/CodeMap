import { STATE, selectPath } from '../state.js';
import { el, basename } from '../dom.js';
import { prepareGraph, renderGraph, hitTest } from '../graph.js';

export function renderGraphView(onChange) {
  if (!STATE.files.length) return splash();

  const wrap = el('div', { cls: 'graph-root' });
  wrap.appendChild(el('div', {
    cls: 'view-hint',
    text: 'Files are nodes (size ∝ √lineCount, color = language). Solid blue edges = files share an external import. Faint gray edges = same language. Hover or click a node to highlight its connections.',
  }));

  const stage = el('div', { cls: 'graph-stage' });
  const host = el('div', { cls: 'graph-host' });
  const canvas = el('canvas', { cls: 'graph-canvas' });
  host.appendChild(canvas);
  stage.appendChild(host);

  const info = el('aside', { cls: 'graph-info' });
  stage.appendChild(info);
  wrap.appendChild(stage);

  requestAnimationFrame(() => attach(canvas, host, info, onChange));
  return wrap;
}

function attach(canvas, host, info, onChange) {
  if (!canvas.isConnected) return;

  const ctx = {
    hoveredPath: null,
    prepared: null,
    preparedFor: '',  // signature: filesRef + WxH
  };

  const draw = () => {
    if (!host.isConnected) {
      ro?.disconnect();
      return;
    }
    const W = host.clientWidth || 600;
    const H = host.clientHeight || 400;
    const sig = `${STATE.files.length}|${W}x${H}`;
    if (ctx.preparedFor !== sig) {
      ctx.prepared = prepareGraph(STATE.files, W, H, STATE.libToPaths);
      ctx.preparedFor = sig;
    }
    renderGraph(canvas, STATE.files, ctx.prepared, {
      hoveredPath: ctx.hoveredPath,
      selectedPath: STATE.selectedPath,
    });
    renderInfo(info, ctx, onChange);
  };

  let ro = null;
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(draw);
    ro.observe(host);
  } else {
    draw();
  }

  canvas.addEventListener('mousemove', e => {
    if (!ctx.prepared) return;
    const rect = canvas.getBoundingClientRect();
    const hit = hitTest(ctx.prepared.layout, e.clientX - rect.left, e.clientY - rect.top);
    const path = hit?.path || null;
    canvas.style.cursor = hit ? 'pointer' : 'default';
    canvas.title = hit ? hit.path : '';
    if (path !== ctx.hoveredPath) {
      ctx.hoveredPath = path;
      draw();
    }
  });
  canvas.addEventListener('mouseleave', () => {
    if (ctx.hoveredPath !== null) { ctx.hoveredPath = null; draw(); }
  });
  canvas.addEventListener('click', e => {
    if (!ctx.prepared) return;
    const rect = canvas.getBoundingClientRect();
    const hit = hitTest(ctx.prepared.layout, e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) return;
    selectPath(hit.path);
    onChange();
  });
}

function renderInfo(info, ctx, onChange) {
  info.replaceChildren();
  const focusPath = ctx.hoveredPath || STATE.selectedPath;
  const edges = ctx.prepared?.edges || [];

  if (!focusPath) {
    info.appendChild(el('div', { cls: 'graph-info-empty', text: 'Hover or click a node to see its connections.' }));
    info.appendChild(legend(edges.length));
    return;
  }

  const importEdges = [], langEdges = [];
  for (const e of edges) {
    if (e.a !== focusPath && e.b !== focusPath) continue;
    (e.kind === 'import' ? importEdges : langEdges).push(e);
  }

  info.appendChild(el('div', { cls: 'graph-info-title', text: basename(focusPath) }));
  info.appendChild(el('div', { cls: 'graph-info-sub', text: focusPath }));

  const sections = [
    { title: `Shared imports (${importEdges.length})`, edges: importEdges, empty: 'no shared imports', cap: Infinity },
    { title: `Same language (${langEdges.length})`,    edges: langEdges,    empty: 'no same-language peers', cap: 12 },
  ];
  for (const s of sections) info.appendChild(section(s, focusPath, onChange));
}

function section({ title, edges, empty, cap }, focusPath, onChange) {
  const sec = el('div', { cls: 'graph-info-sec' });
  sec.appendChild(el('div', { cls: 'graph-info-sec-title', text: title }));
  if (!edges.length) {
    sec.appendChild(el('div', { cls: 'graph-info-empty-sm', text: empty }));
    return sec;
  }
  const visible = edges.slice(0, cap);
  for (const e of visible) sec.appendChild(connectionRow(e, focusPath, onChange));
  if (edges.length > visible.length) {
    sec.appendChild(el('div', { cls: 'graph-info-empty-sm', text: `+${edges.length - visible.length} more` }));
  }
  return sec;
}

function connectionRow(e, focusPath, onChange) {
  const otherPath = e.a === focusPath ? e.b : e.a;
  const row = el('button', {
    cls: 'graph-conn', type: 'button',
    title: otherPath + (e.libs?.length ? `\nshared: ${e.libs.join(', ')}` : ''),
    on: { click: () => { selectPath(otherPath); onChange(); } },
  });
  row.appendChild(el('span', { cls: 'graph-conn-name', text: basename(otherPath) }));
  if (e.libs?.length) {
    row.appendChild(el('span', {
      cls: 'graph-conn-tag',
      text: e.libs.slice(0, 2).join(', ') + (e.libs.length > 2 ? '…' : ''),
    }));
  }
  return row;
}

function legend(edgeCount) {
  const leg = el('div', { cls: 'graph-info-sec' });
  leg.appendChild(el('div', { cls: 'graph-info-sec-title', text: `Edges (${edgeCount})` }));
  leg.appendChild(legendRow('graph-leg-import', 'shared external import'));
  leg.appendChild(legendRow('graph-leg-lang', 'same language'));
  return leg;
}
function legendRow(swatchCls, label) {
  return el('div', { cls: 'graph-leg-row' }, [
    el('span', { cls: `graph-leg-swatch ${swatchCls}` }),
    el('span', { cls: 'graph-leg-label', text: label }),
  ]);
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-icon', text: '🕸️' }),
    el('div', { cls: 'splash-title', text: 'No graph yet' }),
    el('div', { cls: 'splash-sub', text: 'Drop a folder to see file relationships.' }),
  ]);
}
