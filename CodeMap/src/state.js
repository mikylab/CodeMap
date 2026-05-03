import { generateWalk } from './walker.js';
import { newSkipped } from './ingest.js';
import { fnKey, pickEntryForFile } from './trace-graph.js';

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
  fileImports: new Map(),
  fileImporters: new Map(),
  fileTraceRoot: null,
  fileTraceHistory: [],
  fileTraceHistoryIdx: -1,
  gitStatsByPath: {},
  gitLogIngestedAt: null,
};

export function setGitStats(byPath, ingestedAt = Date.now()) {
  STATE.gitStatsByPath = byPath || {};
  STATE.gitLogIngestedAt = byPath ? ingestedAt : null;
}

export function hasGitStats() {
  return !!STATE.gitLogIngestedAt && Object.keys(STATE.gitStatsByPath).length > 0;
}

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
  STATE.walk = generateWalk(STATE);
  STATE.walkIdx = 0;
  STATE.expandedDirs = defaultExpandedDirs(files);
  STATE.expandedFns = new Set();
  const firstFile = files[0] || null;
  STATE.selectedPath = firstFile ? firstFile.path : null;
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

function defaultExpandedDirs(files) {
  const dirs = new Set();
  for (const f of files) {
    const parts = f.path.split('/');
    let acc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      dirs.add(acc);
    }
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

export function setActiveTab(name) { STATE.activeTab = name; }
export function setSidebarFilter(s) { STATE.sidebarFilter = s; }
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
