import {
  STATE, setDetailMode, selectFile, selectFn, clearSelection,
} from '../state.js';
import { cxBucket, isStdlib } from '../tabs.js';
import { fnKey, buildTraceTree } from '../trace-graph.js';
import { el, basename } from '../dom.js';
import { effectBadges, hasAnyTag, effectStrip } from '../effect-badges.js';
import { renderTraceMap } from './trace-graph-view.js';
import { renderOverview } from './overview.js';

// Modes available depend on the kind of selection.
const FILE_MODES = ['summary', 'source', 'calls', 'risk', 'deps'];
const FN_MODES   = ['summary', 'source', 'calls', 'risk'];
const REPO_MODES = ['summary', 'risk', 'deps'];

export function renderWorkspace(onChange) {
  const root = el('div', { cls: 'ws-root' });
  if (!STATE.files.length) {
    root.appendChild(splash());
    return root;
  }
  const sel = selection();
  root.appendChild(headerBar(sel, onChange));
  root.appendChild(modeChips(sel, onChange));
  root.appendChild(modeBody(sel, onChange));
  return root;
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-icon', text: '📁' }),
    el('div', { cls: 'splash-title', text: 'Drop a folder to begin' }),
    el('div', { cls: 'splash-sub', text: 'Codemap reads your code locally — nothing leaves your browser.' }),
  ]);
}

function selection() {
  if (STATE.selectedFnKey) {
    const fn = STATE.fnByKey.get(STATE.selectedFnKey);
    if (fn) return { kind: 'fn', fn, file: STATE.byPath.get(fn.file) || null };
  }
  if (STATE.selectedPath) {
    const f = STATE.byPath.get(STATE.selectedPath);
    if (f) return { kind: 'file', file: f };
  }
  return { kind: 'repo' };
}

function headerBar(sel, onChange) {
  const wrap = el('div', { cls: 'ws-header' });
  if (sel.kind === 'repo') {
    wrap.appendChild(el('div', { cls: 'ws-title' }, [
      el('span', { cls: 'ws-title-icon', text: '⌂' }),
      el('span', { cls: 'ws-title-text', text: 'Repo overview' }),
    ]));
    wrap.appendChild(el('div', { cls: 'ws-sub', text:
      `${STATE.files.length} files · ${STATE.allFns.length} functions · pick a file or function on the left to drill in.` }));
    return wrap;
  }
  if (sel.kind === 'file') {
    const f = sel.file;
    const titleRow = el('div', { cls: 'ws-title' });
    titleRow.appendChild(el('span', {
      cls: 'ws-title-ext',
      text: f.ext,
      style: { background: f.langColor + '22', color: f.langColor },
    }));
    titleRow.appendChild(el('span', { cls: 'ws-title-text', text: f.path }));
    titleRow.appendChild(el('button', {
      cls: 'ws-close', type: 'button', text: '✕',
      title: 'Close — back to repo overview',
      on: { click: () => { clearSelection(); onChange(); } },
    }));
    wrap.appendChild(titleRow);
    wrap.appendChild(el('div', { cls: 'ws-sub' }, [
      stat('lines', String(f.lineCount)),
      stat('fns', String(f.fns.length)),
      stat('cx', f.cx.toFixed(1), cxBucket(f.cx)),
      stat('lang', f.lang),
    ]));
    return wrap;
  }
  // fn
  const fn = sel.fn;
  const titleRow = el('div', { cls: 'ws-title' });
  titleRow.appendChild(el('span', { cls: 'ws-title-icon', text: 'ƒ' }));
  titleRow.appendChild(el('span', { cls: 'ws-title-text', text: `${fn.name}()` }));
  const fxEntry = STATE.effects.get(fnKey(fn));
  if (hasAnyTag(fxEntry)) titleRow.appendChild(effectBadges(fxEntry));
  titleRow.appendChild(el('button', {
    cls: 'ws-close', type: 'button', text: '✕',
    title: 'Close fn — back to its file',
    on: { click: () => { selectFile(fn.file); onChange(); } },
  }));
  wrap.appendChild(titleRow);
  wrap.appendChild(el('div', { cls: 'ws-sub' }, [
    stat('file', basename(fn.file), null, fn.file),
    stat('line', String(fn.lineNum)),
    stat('lines', String(fn.lines)),
    stat('cx', String(fn.cx), cxBucket(fn.cx)),
    stat('callers', String(STATE.fanIn.get(fnKey(fn)) || 0)),
    stat('calls', String(STATE.fanOut.get(fnKey(fn)) || 0)),
  ]));
  return wrap;
}

function stat(label, value, cxKey, title) {
  const wrap = el('span', { cls: 'ws-stat', title: title || `${label}: ${value}` });
  wrap.appendChild(el('span', { cls: 'ws-stat-lbl', text: label }));
  wrap.appendChild(el('span', { cls: 'ws-stat-val' + (cxKey ? ` cx-${cxKey}-fg` : ''), text: value }));
  return wrap;
}

function modesFor(sel) {
  return sel.kind === 'fn' ? FN_MODES : sel.kind === 'file' ? FILE_MODES : REPO_MODES;
}

function modeChips(sel, onChange) {
  const allowed = modesFor(sel);
  const current = allowed.includes(STATE.detailMode) ? STATE.detailMode : allowed[0];
  if (current !== STATE.detailMode) STATE.detailMode = current;
  const wrap = el('div', { cls: 'ws-mode-chips' });
  const labels = {
    summary: 'Summary',
    source:  'Source',
    calls:   'Calls',
    risk:    'Risk',
    deps:    'Deps',
  };
  for (const m of allowed) {
    const on = m === current;
    wrap.appendChild(el('button', {
      cls: `ws-mode-chip${on ? ' on' : ''}`,
      type: 'button',
      text: labels[m],
      on: { click: () => { setDetailMode(m); onChange(); } },
    }));
  }
  return wrap;
}

function modeBody(sel, onChange) {
  const m = STATE.detailMode;
  const root = el('div', { cls: 'ws-body' });
  let body;
  if (sel.kind === 'repo') {
    body = m === 'risk' ? riskRepo(onChange)
         : m === 'deps' ? depsRepo()
         : summaryRepo(onChange);
  } else if (sel.kind === 'file') {
    body = m === 'source' ? sourceFile(sel.file)
         : m === 'calls'  ? callsFile(sel.file, onChange)
         : m === 'risk'   ? riskFile(sel.file, onChange)
         : m === 'deps'   ? depsFile(sel.file, onChange)
         : summaryFile(sel.file, onChange);
  } else {
    body = m === 'source' ? sourceFn(sel.fn)
         : m === 'calls'  ? callsFn(sel.fn, onChange)
         : m === 'risk'   ? riskFn(sel.fn, onChange)
         : summaryFn(sel.fn, onChange);
  }
  root.appendChild(body);
  return root;
}

// ---------- REPO modes ----------

function summaryRepo(onChange) {
  // Reuse Overview view directly.
  return renderOverview();
}

function riskRepo(onChange) {
  const wrap = el('div', { cls: 'ws-pad' });
  const all = STATE.smells;
  if (!all.length) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'No smells detected. ✓' }));
    return wrap;
  }
  wrap.appendChild(el('div', { cls: 'view-hint' }, [
    el('span', { cls: 'view-hint-name', text: 'Risk' }),
    el('span', { text: ` — ${all.length} finding${all.length === 1 ? '' : 's'} across the repo. Click to open the file.` }),
  ]));
  wrap.appendChild(smellList(all, onChange));
  return wrap;
}

function depsRepo() {
  const wrap = el('div', { cls: 'ws-pad' });
  const counts = new Map();
  for (const f of STATE.files) for (const im of f.imports) counts.set(im.lib, (counts.get(im.lib) || 0) + 1);
  const records = [...counts.entries()]
    .map(([lib, count]) => ({ lib, count, type: isStdlib(lib) ? 'stdlib' : 'external' }))
    .sort((a, b) => b.count - a.count || a.lib.localeCompare(b.lib));
  if (!records.length) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'No external imports detected.' }));
    return wrap;
  }
  wrap.appendChild(el('div', { cls: 'view-hint' }, [
    el('span', { cls: 'view-hint-name', text: 'Deps' }),
    el('span', { text: ` — ${records.length} libraries used across the repo, sorted by usage.` }),
  ]));
  const max = records[0].count;
  const grid = el('div', { cls: 'lib-grid' });
  for (const r of records) {
    const c = el('div', { cls: 'lib-card' });
    c.appendChild(el('div', { cls: 'lib-name', text: r.lib }));
    c.appendChild(el('div', { cls: 'lib-count', text: `used ${r.count}×` }));
    const fillColor = r.type === 'stdlib' ? '#888780' : 'var(--accent)';
    const fill = el('div', { cls: 'lib-bar-fill', style: { width: ((r.count / max) * 100) + '%', background: fillColor } });
    c.appendChild(el('div', { cls: 'lib-bar' }, [fill]));
    c.appendChild(el('div', { cls: 'lib-type', style: { color: fillColor }, text: r.type }));
    grid.appendChild(c);
  }
  wrap.appendChild(grid);
  return wrap;
}

// ---------- FILE modes ----------

function summaryFile(f, onChange) {
  const wrap = el('div', { cls: 'ws-pad' });

  // Effects strip
  const fxe = STATE.fileEffects.get(f.path);
  if (fxe && (fxe.direct.size || fxe.inherited.size)) {
    wrap.appendChild(sectionLabel('Effects'));
    wrap.appendChild(effectStrip(fxe));
  }

  // Functions in file (top by cx)
  if (f.fns.length) {
    wrap.appendChild(sectionLabel(`Functions (${f.fns.length})`));
    const sorted = f.fns.slice().sort((a, b) => b.cx - a.cx);
    const list = el('div', { cls: 'ws-fn-list' });
    for (const fn of sorted.slice(0, 12)) {
      list.appendChild(fnPickRow(fn, f, onChange));
    }
    if (sorted.length > 12) {
      list.appendChild(el('div', { cls: 'sb-results-more', text: `+${sorted.length - 12} more — see them in the navigator.` }));
    }
    wrap.appendChild(list);
  }

  // Smells
  const smells = STATE.smellsByFile.get(f.path) || [];
  if (smells.length) {
    wrap.appendChild(sectionLabel(`Risk (${smells.length})`));
    wrap.appendChild(smellList(smells.slice(0, 5), onChange, true));
    if (smells.length > 5) {
      wrap.appendChild(el('button', {
        cls: 'ws-link', type: 'button',
        text: `see all ${smells.length} →`,
        on: { click: () => { setDetailMode('risk'); onChange(); } },
      }));
    }
  }

  // Importers
  const importers = STATE.fileImporters.get(f.path) || [];
  if (importers.length) {
    wrap.appendChild(sectionLabel(`Imported by (${importers.length})`));
    const row = el('div', { cls: 'chip-row' });
    for (const p of importers.slice(0, 12)) {
      row.appendChild(el('button', {
        cls: 'walk-fn-chip', type: 'button', text: p,
        on: { click: () => { selectFile(p); onChange(); } },
      }));
    }
    wrap.appendChild(row);
  }

  return wrap;
}

function sourceFile(f) {
  const wrap = el('div', { cls: 'ws-pad' });
  wrap.appendChild(sectionLabel(`Source — ${f.path}`));
  wrap.appendChild(sourceBlock(f.src.split('\n'), 1));
  return wrap;
}

function callsFile(f, onChange) {
  const wrap = el('div', { cls: 'ws-pad' });
  if (!f.fns.length) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'No functions in this file.' }));
    return wrap;
  }
  wrap.appendChild(el('div', { cls: 'view-hint' }, [
    el('span', { cls: 'view-hint-name', text: 'Calls' }),
    el('span', { text: ' — Pick a function to see what it calls.' }),
  ]));
  const sorted = f.fns.slice().sort((a, b) => b.cx - a.cx);
  const list = el('div', { cls: 'ws-fn-list' });
  for (const fn of sorted) list.appendChild(fnPickRow(fn, f, onChange));
  wrap.appendChild(list);
  return wrap;
}

function riskFile(f, onChange) {
  const wrap = el('div', { cls: 'ws-pad' });
  const smells = STATE.smellsByFile.get(f.path) || [];
  if (!smells.length) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'No smells in this file. ✓' }));
    return wrap;
  }
  wrap.appendChild(el('div', { cls: 'view-hint' }, [
    el('span', { cls: 'view-hint-name', text: 'Risk' }),
    el('span', { text: ` — ${smells.length} finding${smells.length === 1 ? '' : 's'} in ${f.name}.` }),
  ]));
  wrap.appendChild(smellList(smells, onChange));
  return wrap;
}

function depsFile(f, onChange) {
  const wrap = el('div', { cls: 'ws-pad' });
  const imps = f.imports;
  const importers = STATE.fileImporters.get(f.path) || [];
  if (imps.length) {
    wrap.appendChild(sectionLabel(`Imports (${imps.length})`));
    const row = el('div', { cls: 'chip-row' });
    const seen = new Set();
    for (const im of imps) {
      if (seen.has(im.lib)) continue;
      seen.add(im.lib);
      row.appendChild(el('span', {
        cls: `walk-fn-chip ${isStdlib(im.lib) ? 'stdlib' : 'external'}`,
        text: im.lib,
      }));
    }
    wrap.appendChild(row);
  }
  if (importers.length) {
    wrap.appendChild(sectionLabel(`Imported by (${importers.length})`));
    const row = el('div', { cls: 'chip-row' });
    for (const p of importers) {
      row.appendChild(el('button', {
        cls: 'walk-fn-chip', type: 'button', text: p,
        on: { click: () => { selectFile(p); onChange(); } },
      }));
    }
    wrap.appendChild(row);
  }
  if (!imps.length && !importers.length) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'No imports detected.' }));
  }
  return wrap;
}

// ---------- FN modes ----------

function summaryFn(fn, onChange) {
  const wrap = el('div', { cls: 'ws-pad' });
  const key = fnKey(fn);

  // Callers
  const callers = STATE.callersByFn.get(key) || [];
  wrap.appendChild(sectionLabel(`Callers (${callers.length})`));
  if (callers.length) {
    const row = el('div', { cls: 'chip-row' });
    for (const c of callers.slice(0, 16)) {
      const callerFn = STATE.fnByKey.get(c.from);
      if (!callerFn) continue;
      row.appendChild(el('button', {
        cls: `pill in conf-${c.confidence}`,
        type: 'button',
        text: `← ${callerFn.name}`,
        title: `${callerFn.file} · L${callerFn.lineNum}`,
        on: { click: () => { selectFn(callerFn); onChange(); } },
      }));
    }
    wrap.appendChild(row);
  } else {
    wrap.appendChild(el('div', { cls: 'sb-empty small', text: 'No in-codebase callers (could be an entry point).' }));
  }

  // Callees
  const calls = STATE.callsByFn.get(key) || [];
  const resolved = calls.filter(c => c.resolved);
  wrap.appendChild(sectionLabel(`Calls out (${resolved.length} resolved, ${calls.length - resolved.length} external)`));
  if (resolved.length) {
    const row = el('div', { cls: 'chip-row' });
    for (const c of resolved.slice(0, 16)) {
      const target = STATE.fnByKey.get(c.target);
      if (!target) continue;
      row.appendChild(el('button', {
        cls: `pill conf-${c.confidence}`,
        type: 'button',
        text: `${target.name} →`,
        title: `${target.file} · L${target.lineNum}`,
        on: { click: () => { selectFn(target); onChange(); } },
      }));
    }
    wrap.appendChild(row);
  }

  // Smells in this fn
  const smells = (STATE.smellsByFile.get(fn.file) || []).filter(s =>
    s.line >= fn.lineNum && s.line < fn.lineNum + (fn.lines || 1) + 1
  );
  if (smells.length) {
    wrap.appendChild(sectionLabel(`Risk (${smells.length})`));
    wrap.appendChild(smellList(smells, onChange, true));
  }

  // Source preview
  wrap.appendChild(sectionLabel('Source'));
  wrap.appendChild(sourceBlock(extractFnSource(fn), fn.lineNum));
  return wrap;
}

function sourceFn(fn) {
  const wrap = el('div', { cls: 'ws-pad' });
  wrap.appendChild(sectionLabel(`${fn.name}() — ${fn.file}:${fn.lineNum}`));
  wrap.appendChild(sourceBlock(extractFnSource(fn), fn.lineNum));
  return wrap;
}

function callsFn(fn, onChange) {
  const wrap = el('div', { cls: 'ws-pad' });
  const tree = buildTraceTree(fn, STATE.callsByFn, STATE.fnByKey);
  if (!tree) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'No call data.' }));
    return wrap;
  }
  const stats = `reach ${tree.subtree.reach} · files ${tree.subtree.files.size} · depth ${tree.subtree.depth} · hotspots ${tree.subtree.hotspots}`;
  wrap.appendChild(el('div', { cls: 'view-hint' }, [
    el('span', { cls: 'view-hint-name', text: 'Calls' }),
    el('span', { text: ` — ${stats}` }),
  ]));
  let selectedKey = STATE.selectedFnKey;
  const map = renderTraceMap(
    tree,
    findNode(tree, selectedKey) || tree,
    key => { /* node click (in-map) — re-render with selection */ },
    target => { selectFn(target); onChange(); },
  );
  wrap.appendChild(map);
  return wrap;
}

function findNode(node, key) {
  if (!node) return null;
  if (fnKey(node.fn) === key) return node;
  for (const c of node.children) {
    const hit = findNode(c, key);
    if (hit) return hit;
  }
  return null;
}

function riskFn(fn, onChange) {
  const wrap = el('div', { cls: 'ws-pad' });
  const smells = (STATE.smellsByFile.get(fn.file) || []).filter(s =>
    s.line >= fn.lineNum && s.line < fn.lineNum + (fn.lines || 1) + 1
  );
  if (!smells.length) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'No smells in this function. ✓' }));
    return wrap;
  }
  wrap.appendChild(smellList(smells, onChange));
  return wrap;
}

// ---------- shared helpers ----------

function fnPickRow(fn, f, onChange) {
  const key = fnKey(fn);
  const fxEntry = STATE.effects.get(key);
  const row = el('button', {
    cls: 'ws-fn-row',
    type: 'button',
    title: `${fn.name}() · L${fn.lineNum} · cx:${fn.cx}`,
    on: { click: () => { selectFn(fn); onChange(); } },
  });
  row.appendChild(el('span', { cls: 'ws-fn-name', text: fn.name }));
  row.appendChild(el('span', { cls: 'ws-fn-line', text: `L${fn.lineNum}` }));
  row.appendChild(el('span', { cls: `cx-badge cx-${cxBucket(fn.cx)}`, text: String(fn.cx) }));
  if (hasAnyTag(fxEntry)) row.appendChild(effectBadges(fxEntry));
  return row;
}

function smellList(smells, onChange, compact) {
  const wrap = el('div', { cls: 'ws-smell-list' + (compact ? ' compact' : '') });
  const sorted = smells.slice().sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'warn' ? -1 : 1;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
  for (const s of sorted) wrap.appendChild(smellRow(s, onChange));
  return wrap;
}

function smellRow(s, onChange) {
  const row = el('div', { cls: `ws-smell-row sev-${s.severity}` });
  row.appendChild(el('span', { cls: 'ws-smell-icon', text: s.severity === 'warn' ? '⚠' : 'ℹ' }));
  const main = el('div', { cls: 'ws-smell-main' });
  main.appendChild(el('div', { cls: 'ws-smell-head' }, [
    el('button', {
      cls: 'ws-smell-loc', type: 'button',
      text: `${basename(s.file)}:${s.line}`,
      title: `${s.file}:${s.line} — open file`,
      on: { click: () => { selectFile(s.file); onChange(); } },
    }),
    el('span', { cls: 'ws-smell-kind', text: s.subkind ? `${s.kind}/${s.subkind}` : s.kind }),
  ]));
  if (s.snippet) main.appendChild(el('div', { cls: 'ws-smell-snippet', text: s.snippet }));
  if (s.why) main.appendChild(el('div', { cls: 'ws-smell-why', text: s.why }));
  row.appendChild(main);
  return row;
}

function sourceBlock(lines, startLine) {
  const pre = el('pre', { cls: 'fn-source-pre' });
  if (!lines.length) {
    pre.appendChild(el('div', { cls: 'fn-source-empty', text: 'source unavailable' }));
    return pre;
  }
  for (let i = 0; i < lines.length; i++) {
    const row = el('div', { cls: 'fn-source-line' });
    row.appendChild(el('span', { cls: 'fn-source-num', text: String(startLine + i) }));
    row.appendChild(el('span', { cls: 'fn-source-code', text: lines[i] }));
    pre.appendChild(row);
  }
  return pre;
}

function extractFnSource(fn) {
  const file = STATE.byPath.get(fn.file);
  if (!file || !file.src) return [];
  const all = file.src.split('\n');
  const start = Math.max(0, fn.lineNum - 1);
  const end = Math.min(all.length, start + (fn.lines || 1) + 1);
  return all.slice(start, end);
}

function sectionLabel(text) {
  return el('div', { cls: 'ws-section-label', text });
}
