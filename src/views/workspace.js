import {
  STATE, setDetailMode, selectFile, selectFn, clearSelection,
  pushHistory, captureSnapshot, goBack, getSourceAnnotation,
  toggleTraceBranch,
} from '../state.js';
import { cxBucket, isStdlib } from '../tabs.js';
import { fnKey, buildTraceTree } from '../trace-graph.js';
import { el, basename } from '../dom.js';
import { effectBadges, hasAnyTag, effectStrip } from '../effect-badges.js';
import { renderTraceMap } from './trace-graph-view.js';
import { attachSourcePopover } from './source-popover.js';
import { renderFlow } from './flow-view.js';
import { renderOverview } from './overview.js';
import { smellExportBar } from '../smells-export.js';
import { renderDoc } from '../doc-render.js';

// Modes available depend on the kind of selection.
const FILE_MODES = ['summary', 'source', 'calls', 'risk', 'deps'];
const FN_MODES   = ['summary', 'source', 'calls', 'flow', 'risk'];
const REPO_MODES = ['summary', 'risk', 'deps'];

export function renderWorkspace(onChange) {
  const root = el('div', { cls: 'ws-root' });
  if (STATE.selectedDoc) {
    const doc = STATE.docs.find(d => d.path === STATE.selectedDoc);
    if (doc) { root.appendChild(renderDoc(doc, onChange)); return root; }
  }
  if (!STATE.files.length) {
    root.appendChild(splash());
    return root;
  }
  const sel = selection();
  root.appendChild(headerBar(sel, onChange));
  const bc = breadcrumb(onChange);
  if (bc) root.appendChild(bc);
  root.appendChild(modeChips(sel, onChange));
  root.appendChild(modeBody(sel, onChange));
  return root;
}

function breadcrumb(onChange) {
  if (!STATE.history.length) return null;
  const trail = STATE.history;
  const wrap = el('div', { cls: 'ws-breadcrumb' });
  const chips = [];
  trail.forEach((snap, i) => {
    const label = labelForSnap(snap);
    if (!label) return;
    const idxFromEnd = trail.length - i;
    chips.push(el('button', {
      cls: 'ws-bc-chip', type: 'button', text: label,
      title: `Back ${idxFromEnd} step${idxFromEnd === 1 ? '' : 's'}`,
      on: { click: () => {
        for (let k = 0; k < idxFromEnd; k++) goBack();
        onChange();
      } },
    }));
  });
  // Terminal chip for where you are now — non-navigating, so the trail always
  // reads start → … → here even though the current node isn't in history.
  const here = labelForSnap(captureSnapshot());
  if (here) {
    chips.push(el('span', {
      cls: 'ws-bc-chip current', text: here, title: 'You are here',
      attrs: { 'aria-current': 'page' },
    }));
  }
  chips.forEach((chip, i) => {
    wrap.appendChild(chip);
    if (i < chips.length - 1) wrap.appendChild(el('span', { cls: 'ws-bc-sep', text: '›' }));
  });
  return wrap;
}

function labelForSnap(snap) {
  if (snap.kind === 'repo') return '⌂ Repo';
  if (snap.kind === 'doc')  return `📄 ${basename(snap.docPath)}`;
  if (snap.kind === 'file') return basename(snap.path);
  if (snap.kind === 'fn') {
    const fn = STATE.fnByKey.get(snap.fnKey);
    return fn ? `${fn.name}()` : '?';
  }
  return null;
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-icon', text: '📁' }),
    el('div', { cls: 'splash-title', text: 'Drop a folder to begin' }),
    el('div', { cls: 'splash-sub', text: 'Codemap reads your code locally — nothing leaves your browser. Press ? at any time for a glossary.' }),
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
  if (STATE.history.length) {
    wrap.appendChild(el('button', {
      cls: 'ws-back-btn', type: 'button', text: '←',
      title: 'Back (Backspace / Alt+←)',
      on: { click: () => { goBack(); onChange(); } },
    }));
  }
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

const STAT_TOOLTIPS = {
  cx: 'Cyclomatic complexity — count of decision points (if/for/while/&&/||/?). Higher = harder to follow. Press ? for the full glossary.',
  callers: 'Functions in this codebase that call this one (fan-in).',
  calls: 'Distinct in-codebase functions this one calls (fan-out). External/library calls are excluded.',
  fns: 'Functions defined in this file.',
  lines: 'Total lines in this file (or in this function body).',
  line: 'Line number where this function starts.',
  lang: 'Detected programming language.',
  file: 'File this function is defined in.',
};

function stat(label, value, cxKey, title) {
  const tip = title || STAT_TOOLTIPS[label] || `${label}: ${value}`;
  const wrap = el('span', { cls: 'ws-stat', title: tip });
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
    flow:    'Flow',
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
         : m === 'flow'   ? renderFlow(sel.fn, onChange)
         : m === 'risk'   ? riskFn(sel.fn, onChange)
         : summaryFn(sel.fn, onChange);
  }
  root.appendChild(body);
  return root;
}

// ---------- REPO modes ----------

function summaryRepo(onChange) {
  const wrap = el('div', { cls: 'ws-pad ws-pad-wide' });
  if (STATE.readme) {
    const block = readmeBlock(STATE.readme);
    if (block) wrap.appendChild(block);
  }
  wrap.appendChild(repoOverviewCard(onChange));
  wrap.appendChild(renderOverview());
  return wrap;
}

function readmeBlock(readme) {
  const collapsible = readme.raw.split('\n').length > 8;
  const wrap = el('div', { cls: 'ws-readme' });

  const body = el('pre', { cls: 'ws-readme-body' + (collapsible ? ' collapsed' : '') });
  body.textContent = readme.raw;

  // Header carries the label and the collapse control. It's sticky and the body
  // scrolls within a capped height, so the toggle stays reachable no matter how
  // far you've scrolled into a long README.
  const head = el('div', { cls: 'ws-readme-head' });
  head.appendChild(el('span', { cls: 'ws-section-label', text: `From ${readme.name}` }));
  if (collapsible) {
    const toggle = el('button', {
      cls: 'ws-readme-toggle', type: 'button', text: 'expand',
      on: { click: () => {
        const collapsed = body.classList.toggle('collapsed');
        toggle.textContent = collapsed ? 'expand' : 'collapse';
        if (collapsed) body.scrollTop = 0;
      } },
    });
    head.appendChild(toggle);
  }

  wrap.appendChild(head);
  wrap.appendChild(body);
  return wrap;
}

function docBlock(text, opts = {}) {
  if (!text) return null;
  const wrap = el('div', { cls: 'ws-docblock' });
  if (opts.label) wrap.appendChild(el('div', { cls: 'ws-section-label', text: opts.label }));
  const body = el('div', { cls: 'ws-docblock-body' });
  body.textContent = text;
  wrap.appendChild(body);
  return wrap;
}

function riskRepo(onChange) {
  const wrap = el('div', { cls: 'ws-pad' });
  const all = STATE.smells;
  if (!all.length) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'No smells detected. ✓' }));
    return wrap;
  }
  const head = el('div', { cls: 'view-hint' }, [
    el('span', { cls: 'view-hint-name', text: 'Risk' }),
    el('span', { text: ` — ${all.length} finding${all.length === 1 ? '' : 's'} across the repo. Click to open the file.` }),
  ]);
  wrap.appendChild(head);
  wrap.appendChild(smellExportBar(all, 'all-smells'));
  wrap.appendChild(smellList(all, onChange));
  return wrap;
}

function repoOverviewCard(onChange) {
  const card = el('div', { cls: 'ov-summary-card' });
  const stepsByCat = new Map();
  for (const s of STATE.walk) if (!stepsByCat.has(s.category)) stepsByCat.set(s.category, s);

  const arch = stepsByCat.get('archetype');
  const entry = stepsByCat.get('entry');
  const core = stepsByCat.get('core');

  // Header row.
  const head = el('div', { cls: 'ov-summary-head' });
  head.appendChild(el('div', { cls: 'ov-summary-title', text: 'What is this repo?' }));
  head.appendChild(el('div', { cls: 'ov-summary-sub', text:
    arch ? arch.content : 'No framework signature detected — this looks like a library or script collection.' }));
  card.appendChild(head);

  const grid = el('div', { cls: 'ov-summary-grid' });

  // Entry points
  if (entry && (entry.fns.length || entry.files.length)) {
    grid.appendChild(ovSection('Entry points', entry.fns.length ? entry.fns.slice(0, 4) : entry.files.slice(0, 4),
      item => entry.fns.includes(item) ? fnChipBtn(item, onChange) : fileChipBtn(item, onChange)));
  }

  // Core modules (most-imported)
  if (core && core.files.length) {
    grid.appendChild(ovSection('Most-imported', core.files.slice(0, 4),
      p => fileChipBtn(p, onChange)));
  }

  // Top external deps
  const deps = topExternalDeps(5);
  if (deps.length) {
    grid.appendChild(ovSection('Top external deps', deps,
      d => el('span', { cls: 'walk-fn-chip ov-dep-chip', text: `${d.lib} · ${d.count}×` })));
  }

  card.appendChild(grid);
  return card;
}

function ovSection(label, items, makeChip) {
  const sec = el('div', { cls: 'ov-summary-sec' });
  sec.appendChild(el('div', { cls: 'ws-section-label', text: label }));
  const row = el('div', { cls: 'chip-row' });
  for (const it of items) row.appendChild(makeChip(it));
  sec.appendChild(row);
  return sec;
}

function fileChipBtn(path, onChange) {
  return el('button', {
    cls: 'walk-fn-chip walk-file-chip', type: 'button', text: path,
    title: `Open ${path}`,
    on: { click: () => { pushHistory(captureSnapshot()); selectFile(path); onChange(); } },
  });
}

function fnChipBtn(name, onChange) {
  return el('button', {
    cls: 'walk-fn-chip', type: 'button', text: name,
    title: `Open ${name}()`,
    on: { click: () => {
      const fn = STATE.fnByName.get(name);
      if (fn) { pushHistory(captureSnapshot()); selectFn(fn); onChange(); }
    } },
  });
}

function topExternalDeps(n) {
  const counts = new Map();
  for (const f of STATE.files) for (const im of f.imports) {
    if (isStdlib(im.lib)) continue;
    counts.set(im.lib, (counts.get(im.lib) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([lib, count]) => ({ lib, count }))
    .sort((a, b) => b.count - a.count || a.lib.localeCompare(b.lib))
    .slice(0, n);
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

  if (f.fileDoc) {
    const db = docBlock(f.fileDoc, { label: 'Description' });
    if (db) wrap.appendChild(db);
  }

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
        on: { click: () => { pushHistory(captureSnapshot()); selectFile(p); onChange(); } },
      }));
    }
    wrap.appendChild(row);
  }

  return wrap;
}

function sourceFile(f) {
  const wrap = el('div', { cls: 'ws-pad' });
  wrap.appendChild(sectionLabel(`Source — ${f.path}`));
  wrap.appendChild(sourceBlock(f.src.split('\n'), 1, { path: f.path }));
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
        on: { click: () => { pushHistory(captureSnapshot()); selectFile(p); onChange(); } },
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
        on: { click: () => { pushHistory(captureSnapshot()); selectFn(callerFn); onChange(); } },
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
        on: { click: () => { pushHistory(captureSnapshot()); selectFn(target); onChange(); } },
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

  // Doc + source preview
  if (fn.doc) {
    const db = docBlock(fn.doc, { label: 'Description' });
    if (db) wrap.appendChild(db);
  }
  wrap.appendChild(sectionLabel('Source'));
  wrap.appendChild(sourceBlock(extractFnSource(fn), fn.lineNum, { path: fn.file }));
  return wrap;
}

function sourceFn(fn) {
  const wrap = el('div', { cls: 'ws-pad' });
  wrap.appendChild(sectionLabel(`${fn.name}() — ${fn.file}:${fn.lineNum}`));
  wrap.appendChild(sourceBlock(extractFnSource(fn), fn.lineNum, { path: fn.file }));
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
  const map = renderTraceMap(
    tree,
    target => { pushHistory(captureSnapshot()); selectFn(target); onChange(); },
    key => { toggleTraceBranch(key); onChange(); },
    STATE.expandedTraceBranches,
  );
  wrap.appendChild(map);
  return wrap;
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
    on: { click: () => { pushHistory(captureSnapshot()); selectFn(fn); onChange(); } },
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
  const hasDetail = !!(s.snippet || s.why);
  const row = el('details', { cls: `ws-smell-row sev-${s.severity}` });
  const summary = el('summary', { cls: 'ws-smell-summary' });
  summary.appendChild(el('span', {
    cls: 'ws-smell-caret',
    text: hasDetail ? '▸' : '·',
    attrs: hasDetail ? {} : { 'aria-hidden': 'true' },
  }));
  summary.appendChild(el('span', { cls: 'ws-smell-icon', text: s.severity === 'warn' ? '⚠' : 'ℹ' }));
  const main = el('div', { cls: 'ws-smell-main' });
  main.appendChild(el('div', { cls: 'ws-smell-head' }, [
    el('button', {
      cls: 'ws-smell-loc', type: 'button',
      text: `${basename(s.file)}:${s.line}`,
      title: `${s.file}:${s.line} — open file`,
      on: { click: e => { e.preventDefault(); e.stopPropagation(); pushHistory(captureSnapshot()); selectFile(s.file); onChange(); } },
    }),
    el('span', { cls: 'ws-smell-kind', text: s.subkind ? `${s.kind}/${s.subkind}` : s.kind }),
  ]));
  summary.appendChild(main);
  row.appendChild(summary);
  if (s.snippet) row.appendChild(el('div', { cls: 'ws-smell-snippet', text: s.snippet }));
  if (s.why) row.appendChild(el('div', { cls: 'ws-smell-why', text: s.why }));
  if (!hasDetail) {
    summary.style.cursor = 'default';
    summary.addEventListener('click', e => e.preventDefault());
  }
  return row;
}

function sourceBlock(lines, startLine, opts = {}) {
  const pre = el('pre', { cls: 'fn-source-pre' });
  if (!lines.length) {
    pre.appendChild(el('div', { cls: 'fn-source-empty', text: 'source unavailable' }));
    return pre;
  }
  const ann = opts.path ? getSourceAnnotation(opts.path) : null;
  for (let i = 0; i < lines.length; i++) {
    const lineNum = startLine + i;
    const row = el('div', { cls: 'fn-source-line' });
    row.appendChild(el('span', { cls: 'fn-source-num', text: String(lineNum) }));
    const code = el('span', { cls: 'fn-source-code' });
    const annots = ann?.byLine?.get(lineNum) || [];
    if (!annots.length) {
      code.textContent = lines[i];
    } else {
      renderAnnotatedLine(code, lines[i], annots);
    }
    row.appendChild(code);
    pre.appendChild(row);
  }
  attachSourcePopover(pre);
  return pre;
}

function renderAnnotatedLine(parent, lineText, annots) {
  let cursor = 0;
  for (const a of annots) {
    if (a.col > cursor) {
      parent.appendChild(document.createTextNode(lineText.slice(cursor, a.col)));
    }
    const tok = lineText.slice(a.col, a.col + a.len);
    parent.appendChild(makeAnnotElement(a, tok));
    cursor = a.col + a.len;
  }
  if (cursor < lineText.length) {
    parent.appendChild(document.createTextNode(lineText.slice(cursor)));
  }
}

function makeAnnotElement(a, tok) {
  if (a.kind === 'function' || a.kind === 'class') {
    return el('button', {
      cls: `src-link kind-${a.kind}`,
      type: 'button', text: tok,
      attrs: { 'data-kind': a.kind, 'data-file': a.file, 'data-line': String(a.lineNum), 'data-label': a.label },
      on: { click: () => jumpToDef(a) },
    });
  }
  if (a.kind === 'import') {
    return el('button', {
      cls: 'src-link kind-import',
      type: 'button', text: tok,
      attrs: { 'data-kind': 'import', 'data-file': a.file, 'data-label': a.label },
      on: { click: () => {
        pushHistory(captureSnapshot());
        selectFile(a.file);
        document.dispatchEvent(new CustomEvent('codemap:rerender'));
      } },
    });
  }
  if (a.kind === 'ambiguous') {
    return el('button', {
      cls: 'src-link kind-ambiguous',
      type: 'button', text: tok,
      attrs: { 'data-kind': 'ambiguous', 'data-label': a.label,
               'data-candidates': JSON.stringify(a.candidates) },
      on: { click: e => e.preventDefault() },
    });
  }
  if (a.kind === 'param' || a.kind === 'local' || a.kind === 'builtin') {
    return el('span', {
      cls: `src-link kind-${a.kind}`,
      text: tok,
      attrs: {
        'data-kind': a.kind, 'data-label': a.label, tabindex: '0',
        ...(a.context ? { 'data-context': a.context } : {}),
        ...(a.language ? { 'data-language': a.language } : {}),
        ...(a.shadowed ? { 'data-shadowed': JSON.stringify(a.shadowed) } : {}),
      },
    });
  }
  return el('span', {
    cls: 'src-link kind-unresolved',
    text: tok,
    attrs: { 'data-kind': 'unresolved', 'data-label': a.label, tabindex: '0' },
  });
}

function jumpToDef(a) {
  pushHistory(captureSnapshot());
  const f = STATE.byPath.get(a.file);
  const fn = (f?.fns || []).find(x => x.lineNum === a.lineNum);
  if (fn) { selectFn(fn); STATE.detailMode = 'source'; }
  else { selectFile(a.file); }
  document.dispatchEvent(new CustomEvent('codemap:rerender'));
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
