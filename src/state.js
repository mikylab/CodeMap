import { generateWalk } from './walker.js';
import { newSkipped } from './ingest.js';
import { fnKey, pickEntryForFile } from './trace-graph.js';
import { computeEffects } from './effects.js';
import { detectSmells, indexSmellsByFile } from './smells.js';

const EMPTY_ANALYSIS = {
  edges: [], degree: new Map(), libToPaths: new Map(),
  callsByFn: new Map(), callersByFn: new Map(), callEdges: [],
  fanIn: new Map(), fanOut: new Map(),
  fileImports: new Map(), fileImporters: new Map(),
};

export const STATE = {
  files: [],
  byPath: new Map(),
  allFns: [],
  fnByName: new Map(),
  fnByKey: new Map(),
  selectedPath: null,
  edges: [],
  degree: new Map(),
  libToPaths: new Map(),
  callsByFn: new Map(),
  callersByFn: new Map(),
  callEdges: [],
  fanIn: new Map(),
  fanOut: new Map(),
  walk: [],
  walkIdx: 0,
  activeTab: 'overview',
  sidebarFilter: '',
  functionsSort: 'cx',
  traceHistory: [],
  traceHistoryIdx: -1,
  skipped: newSkipped(),
  expandedDirs: new Set(),
  expandedFns: new Set(),
  expandedWalkSteps: new Set(),
  expandedTraceSource: true,
  collapsedGraphDirs: new Set(),
  graphView: null,
  graphSize: null,
  graphFilter: '',
  graphHideIsolated: true,
  fileImports: new Map(),
  fileImporters: new Map(),
  effects: new Map(),
  fileEffects: new Map(),
  fnEffectFilter: new Set(),
  smells: [],
  smellsByFile: new Map(),
  smellsKindFilter: new Set(),
  smellsFileFilter: null,
  paint: { kind: null, startKey: null, endKey: null, direction: 'forward' },
  fileTraceRoot: null,
  fileTraceHistory: [],
  fileTraceHistoryIdx: -1,
  // workspace UI
  selectedFnKey: null,            // when set, detail pane is in fn mode
  detailMode: 'summary',          // sticky: summary | source | calls | risk | deps
  fullscreen: null,               // null | 'walk' | 'graph' | 'smells'
  navSearch: '',                  // search box in navigator
};

// `traceRoot` is derived from history rather than stored — single source of truth.
export function getTraceRoot() {
  return STATE.traceHistory[STATE.traceHistoryIdx] || null;
}

export function setFiles(files, analysis = EMPTY_ANALYSIS) {
  STATE.files = files;
  STATE.byPath = new Map(files.map(f => [f.path, f]));
  STATE.allFns = files.flatMap(f => f.fns);
  STATE.fnByName = indexByName(STATE.allFns);
  STATE.fnByKey = new Map(STATE.allFns.map(fn => [fnKey(fn), fn]));
  STATE.edges = analysis.edges;
  STATE.degree = analysis.degree;
  STATE.libToPaths = analysis.libToPaths;
  STATE.callsByFn = analysis.callsByFn || new Map();
  STATE.callersByFn = analysis.callersByFn || new Map();
  STATE.callEdges = analysis.callEdges || [];
  STATE.fanIn = analysis.fanIn || new Map();
  STATE.fanOut = analysis.fanOut || new Map();
  STATE.fileImports = analysis.fileImports || new Map();
  STATE.fileImporters = analysis.fileImporters || new Map();
  computeEffects(STATE);
  STATE.smells = detectSmells(STATE);
  STATE.smellsByFile = indexSmellsByFile(STATE.smells);
  STATE.smellsKindFilter = new Set();
  STATE.smellsFileFilter = null;
  STATE.paint = { kind: null, startKey: null, endKey: null, direction: 'forward' };
  STATE.walk = generateWalk(STATE);
  STATE.walkIdx = 0;
  STATE.expandedDirs = defaultExpandedDirs(files);
  STATE.expandedFns = new Set();
  STATE.expandedWalkSteps = new Set();
  STATE.collapsedGraphDirs = defaultCollapsedGraphDirs(files);
  STATE.graphView = null;
  const firstFile = files[0] || null;
  STATE.selectedPath = null;
  STATE.selectedFnKey = null;
  STATE.detailMode = 'summary';
  STATE.fullscreen = null;
  STATE.navSearch = '';
  STATE.fileTraceRoot = firstFile ? firstFile.path : null;
  STATE.fileTraceHistory = firstFile ? [firstFile.path] : [];
  STATE.fileTraceHistoryIdx = firstFile ? 0 : -1;
  if (firstFile) expandAncestors(firstFile.path);
  const entry = firstFile
    ? pickEntryForFile(firstFile, STATE.callsByFn, STATE.callersByFn, STATE.fnByKey)
    : null;
  const ref = fnToTraceRoot(entry);
  STATE.traceHistory = ref ? [ref] : [];
  STATE.traceHistoryIdx = ref ? 0 : -1;
}

function indexByName(fns) {
  const m = new Map();
  for (const fn of fns) if (!m.has(fn.name)) m.set(fn.name, fn);
  return m;
}

function fnToTraceRoot(fn) {
  return fn ? { name: fn.name, file: fn.file, lineNum: fn.lineNum } : null;
}

function refsEqual(a, b) {
  return !!a && !!b && a.name === b.name && a.file === b.file && a.lineNum === b.lineNum;
}

export function selectPath(p) {
  // Sidebar expansion only — does not change the trace root. The user explicitly
  // clicks a function to start tracing.
  STATE.selectedPath = p;
  if (p) expandAncestors(p);
}

export function toggleDir(dirPath) {
  if (STATE.expandedDirs.has(dirPath)) STATE.expandedDirs.delete(dirPath);
  else STATE.expandedDirs.add(dirPath);
}

export function toggleFnExpanded(key) {
  if (STATE.expandedFns.has(key)) STATE.expandedFns.delete(key);
  else STATE.expandedFns.add(key);
}

export function toggleWalkStep(idx) {
  if (STATE.expandedWalkSteps.has(idx)) STATE.expandedWalkSteps.delete(idx);
  else STATE.expandedWalkSteps.add(idx);
}

export function setAllWalkStepsExpanded(expanded) {
  if (expanded) {
    STATE.expandedWalkSteps = new Set(STATE.walk.map((_, i) => i));
  } else {
    STATE.expandedWalkSteps = new Set();
  }
}

export function toggleTraceSource() {
  STATE.expandedTraceSource = !STATE.expandedTraceSource;
}

export function toggleGraphDir(dir) {
  if (STATE.collapsedGraphDirs.has(dir)) STATE.collapsedGraphDirs.delete(dir);
  else STATE.collapsedGraphDirs.add(dir);
  STATE.graphView = null;
}

export function resetGraphCollapse() {
  STATE.collapsedGraphDirs = defaultCollapsedGraphDirs(STATE.files);
  STATE.graphView = null;
}

export function setGraphView(v) { STATE.graphView = v; }
export function resetGraphView() { STATE.graphView = null; }

export function zoomGraph(factor) {
  const size = STATE.graphSize;
  if (!size) return;
  const v = STATE.graphView || { x: 0, y: 0, w: size.W, h: size.H };
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  const nw = Math.max(size.W * 0.05, Math.min(size.W * 6, v.w * factor));
  const nh = Math.max(size.H * 0.05, Math.min(size.H * 6, v.h * factor));
  STATE.graphView = { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
}

export function setGraphFilter(s) { STATE.graphFilter = s || ''; }
export function toggleGraphHideIsolated() { STATE.graphHideIsolated = !STATE.graphHideIsolated; STATE.graphView = null; }
export function clearGraphFocus() {
  STATE.fileTraceRoot = null;
  STATE.selectedPath = null;
}

export function setFileTraceRoot(path) {
  if (!path) return;
  if (STATE.fileTraceRoot === path) return;
  STATE.fileTraceRoot = path;
  if (STATE.fileTraceHistoryIdx < STATE.fileTraceHistory.length - 1) {
    STATE.fileTraceHistory = STATE.fileTraceHistory.slice(0, STATE.fileTraceHistoryIdx + 1);
  }
  STATE.fileTraceHistory.push(path);
  STATE.fileTraceHistoryIdx = STATE.fileTraceHistory.length - 1;
}

export function gotoFileTraceHistory(idx) {
  if (idx < 0 || idx >= STATE.fileTraceHistory.length) return;
  STATE.fileTraceHistoryIdx = idx;
  STATE.fileTraceRoot = STATE.fileTraceHistory[idx];
}

const COLLAPSE_THRESHOLD = 15;

// Returns the meaningful directory clusters for the given files: each top-level
// dir, OR — when there's a single wrapper dir — the wrapper's child dirs.
// Collapsing the wrapper alone would just produce one mega-cluster, so we drill
// in. Result is Map<dirPath, fileCount> sorted by descending count.
export function topClusterMap(files) {
  const tops = new Map();
  for (const f of files) {
    const i = f.path.indexOf('/');
    if (i <= 0) continue;
    const top = f.path.slice(0, i);
    if (!tops.has(top)) tops.set(top, []);
    tops.get(top).push(f.path);
  }
  const out = new Map();
  if (tops.size === 1) {
    const [topName, paths] = [...tops][0];
    for (const p of paths) {
      const rest = p.slice(topName.length + 1);
      const j = rest.indexOf('/');
      if (j <= 0) continue;
      const name = `${topName}/${rest.slice(0, j)}`;
      out.set(name, (out.get(name) || 0) + 1);
    }
  } else {
    for (const [top, paths] of tops) out.set(top, paths.length);
  }
  return out;
}

function defaultCollapsedGraphDirs(files) {
  if (files.length < COLLAPSE_THRESHOLD) return new Set();
  return new Set(topClusterMap(files).keys());
}

function defaultExpandedDirs(files) {
  // Only top-level directories are expanded by default — deeper folders stay
  // collapsed so the sidebar reads as an outline rather than a wall of files.
  const dirs = new Set();
  for (const f of files) {
    const parts = f.path.split('/');
    if (parts.length > 1) dirs.add(parts[0]);
  }
  return dirs;
}

function expandAncestors(path) {
  const parts = path.split('/');
  let acc = '';
  for (let i = 0; i < parts.length - 1; i++) {
    acc = acc ? `${acc}/${parts[i]}` : parts[i];
    STATE.expandedDirs.add(acc);
  }
}

export function setTraceRoot(fn) {
  if (!fn) return;
  const ref = fnToTraceRoot(fn);
  if (refsEqual(ref, getTraceRoot())) return;
  if (STATE.traceHistoryIdx < STATE.traceHistory.length - 1) {
    STATE.traceHistory = STATE.traceHistory.slice(0, STATE.traceHistoryIdx + 1);
  }
  STATE.traceHistory.push(ref);
  STATE.traceHistoryIdx = STATE.traceHistory.length - 1;
}

export function gotoTraceHistory(idx) {
  if (idx < 0 || idx >= STATE.traceHistory.length) return;
  STATE.traceHistoryIdx = idx;
  STATE.selectedPath = STATE.traceHistory[idx].file;
}

export function clearTraceHistory(fn) {
  // Re-anchors the trail with `fn` as the new origin (used when the user picks a
  // fresh function from the sidebar).
  const ref = fn ? fnToTraceRoot(fn) : null;
  STATE.traceHistory = ref ? [ref] : [];
  STATE.traceHistoryIdx = ref ? 0 : -1;
  if (ref) STATE.selectedPath = ref.file;
}

export function setWalkIdx(i) {
  if (!STATE.walk.length) { STATE.walkIdx = 0; return; }
  STATE.walkIdx = Math.max(0, Math.min(STATE.walk.length - 1, i));
}

export function toggleFnEffectFilter(tag) {
  if (STATE.fnEffectFilter.has(tag)) STATE.fnEffectFilter.delete(tag);
  else STATE.fnEffectFilter.add(tag);
}

export function toggleSmellKindFilter(kind) {
  if (STATE.smellsKindFilter.has(kind)) STATE.smellsKindFilter.delete(kind);
  else STATE.smellsKindFilter.add(kind);
}

export function setSmellsFileFilter(path) { STATE.smellsFileFilter = path || null; }
export function clearSmellsFileFilter() { STATE.smellsFileFilter = null; }

export function setPaintEndpoint(role, kind, key) {
  // role: 'start' | 'end'.  kind: 'fn' | 'file'.
  const p = STATE.paint;
  if (p.kind && p.kind !== kind) return false; // mixing modes blocked
  p.kind = kind;
  if (role === 'start') p.startKey = key;
  else p.endKey = key;
  return true;
}
export function clearPaint() {
  STATE.paint = { kind: null, startKey: null, endKey: null, direction: 'forward' };
}
export function reversePaintDirection() {
  STATE.paint.direction = STATE.paint.direction === 'forward' ? 'reverse' : 'forward';
}

export function setActiveTab(name) { STATE.activeTab = name; }
export function setSidebarFilter(s) { STATE.sidebarFilter = s; }

// workspace mutators
export function setDetailMode(m) { STATE.detailMode = m; }
export function setFullscreen(name) { STATE.fullscreen = name || null; }
export function exitFullscreen() { STATE.fullscreen = null; }
export function setNavSearch(s) { STATE.navSearch = s || ''; }
export function selectFile(path) {
  STATE.selectedPath = path || null;
  STATE.selectedFnKey = null;
  if (path) expandAncestors(path);
}
export function selectFn(fn) {
  if (!fn) { STATE.selectedFnKey = null; return; }
  STATE.selectedPath = fn.file;
  STATE.selectedFnKey = fnKey(fn);
  expandAncestors(fn.file);
}
export function clearSelection() {
  STATE.selectedPath = null;
  STATE.selectedFnKey = null;
}
export function setFunctionsSort(s) { STATE.functionsSort = s; }
export function setSkipped(s) { STATE.skipped = s || newSkipped(); }

export function visibleFiles() {
  const filter = STATE.sidebarFilter.toLowerCase();
  return STATE.files
    .filter(f => !filter || f.path.toLowerCase().includes(filter))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function selectFileByOffset(delta) {
  const visible = visibleFiles();
  if (!visible.length) return;
  const i = visible.findIndex(f => f.path === STATE.selectedPath);
  const next = i < 0
    ? (delta > 0 ? 0 : visible.length - 1)
    : Math.max(0, Math.min(visible.length - 1, i + delta));
  STATE.selectedPath = visible[next].path;
}
