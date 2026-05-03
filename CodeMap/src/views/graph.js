import { STATE, selectPath } from '../state.js';
import { el, basename } from '../dom.js';
import { renderGraph, hitTest } from '../graph.js';

let resizeObserver = null;
let hoveredPath = null;

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
  hoveredPath = null;

  let result = renderGraph(canvas, STATE.files, { selectedPath: STATE.selectedPath });
  renderInfo(info, result, onChange);

  const draw = () => {
    result = renderGraph(canvas, STATE.files, {
      hoveredPath, selectedPath: STATE.selectedPath,
    });
    renderInfo(info, result, onChange);
  };

  if (resizeObserver) { try { resizeObserver.disconnect(); } catch {} }
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(host);
  }

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const hit = hitTest(result.layout, e.clientX - rect.left, e.clientY - rect.top);
    const path = hit?.path || null;
    canvas.style.cursor = hit ? 'pointer' : 'default';
    canvas.title = hit ? hit.path : '';
    if (path !== hoveredPath) {
      hoveredPath = path;
      draw();
    }
  });
  canvas.addEventListener('mouseleave', () => {
    if (hoveredPath !== null) { hoveredPath = null; draw(); }
  });
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const hit = hitTest(result.layout, e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) return;
    selectPath(hit.path);
    onChange();
  });
}

function renderInfo(info, result, onChange) {
  info.replaceChildren();
  const focusPath = hoveredPath || STATE.selectedPath;
  if (!focusPath) {
    info.appendChild(el('div', { cls: 'graph-info-empty', text: 'Hover or click a node to see its connections.' }));
    info.appendChild(legend(result.edges.length));
    return;
  }
  const file = STATE.byPath.get(focusPath);
  if (!file) return;

  info.appendChild(el('div', { cls: 'graph-info-title', text: basename(focusPath) }));
  info.appendChild(el('div', { cls: 'graph-info-sub', text: focusPath }));

  const importEdges = result.edges.filter(e =>
    (e.a === focusPath || e.b === focusPath) && e.kind === 'import');
  const langEdges = result.edges.filter(e =>
    (e.a === focusPath || e.b === focusPath) && e.kind === 'lang');

  info.appendChild(section(
    `Shared imports (${importEdges.length})`,
    importEdges.map(e => connectionRow(e, focusPath, onChange)),
    'no shared imports',
  ));
  info.appendChild(section(
    `Same language (${langEdges.length})`,
    langEdges.slice(0, 12).map(e => connectionRow(e, focusPath, onChange)),
    'no same-language peers',
    langEdges.length > 12 ? `+${langEdges.length - 12} more` : null,
  ));
}

function section(title, rows, emptyMsg, footer) {
  const sec = el('div', { cls: 'graph-info-sec' });
  sec.appendChild(el('div', { cls: 'graph-info-sec-title', text: title }));
  if (!rows.length) {
    sec.appendChild(el('div', { cls: 'graph-info-empty-sm', text: emptyMsg }));
    return sec;
  }
  for (const r of rows) sec.appendChild(r);
  if (footer) sec.appendChild(el('div', { cls: 'graph-info-empty-sm', text: footer }));
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
    row.appendChild(el('span', { cls: 'graph-conn-tag', text: e.libs.slice(0, 2).join(', ') + (e.libs.length > 2 ? '…' : '') }));
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
