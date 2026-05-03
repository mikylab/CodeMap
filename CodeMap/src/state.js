import { generateWalk } from './walker.js';
import { newSkipped } from './ingest.js';
import { fnKey, pickEntryForFile } from './trace-graph.js';

const EMPTY_ANALYSIS = {
  edges: [], degree: new Map(), libToPaths: new Map(),
  callsByFn: new Map(), callersByFn: new Map(), callEdges: [],
  fanIn: new Map(), fanOut: new Map(),
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
  traceRoot: null,
  traceHistory: [],         // ordered list of {name, file, lineNum} visited
  traceHistoryIdx: -1,      // current position within traceHistory
  traceView: 'tree',
  skipped: newSkipped(),
};

export function setFiles(files, analysis = EMPTY_ANALYSIS) {
  STATE.files = files;
  STATE.byPath = new Map(files.map(f => [f.path, f]));
  STATE.allFns = files.flatMap(f => f.fns);
  STATE.fnByName = indexByName(STATE.allFns);
  STATE.fnByKey = new Map(STATE.allFns.map(fn => [fnKey(fn), fn]));
  STATE.selectedPath = null;
  STATE.edges = analysis.edges;
  STATE.degree = analysis.degree;
  STATE.libToPaths = analysis.libToPaths;
  STATE.callsByFn = analysis.callsByFn || new Map();
  STATE.callersByFn = analysis.callersByFn || new Map();
  STATE.callEdges = analysis.callEdges || [];
  STATE.fanIn = analysis.fanIn || new Map();
  STATE.fanOut = analysis.fanOut || new Map();
  STATE.walk = generateWalk(STATE);
  STATE.walkIdx = 0;
  // Initial trace defaults to first file's best entry, but the user is in charge from there.
  const firstFile = files[0] || null;
  STATE.selectedPath = firstFile ? firstFile.path : null;
  const entry = firstFile
    ? pickEntryForFile(firstFile, STATE.callsByFn, STATE.callersByFn, STATE.fnByKey)
    : null;
  STATE.traceRoot = fnToTraceRoot(entry);
  STATE.traceHistory = entry ? [STATE.traceRoot] : [];
  STATE.traceHistoryIdx = entry ? 0 : -1;
}

function indexByName(fns) {
  const m = new Map();
  for (const fn of fns) if (!m.has(fn.name)) m.set(fn.name, fn);
  return m;
}

function fnToTraceRoot(fn) {
  return fn ? { name: fn.name, file: fn.file, lineNum: fn.lineNum } : null;
}

export function selectPath(p) {
  // Pure expansion in the sidebar — does NOT change the trace root. The user
  // explicitly clicks a function to start tracing.
  STATE.selectedPath = p;
}

export function pushTraceRoot(fn) {
  if (!fn) return;
  const ref = fnToTraceRoot(fn);
  STATE.traceRoot = ref;
  // Truncate any forward history if we navigated back and re-branched.
  if (STATE.traceHistoryIdx < STATE.traceHistory.length - 1) {
    STATE.traceHistory = STATE.traceHistory.slice(0, STATE.traceHistoryIdx + 1);
  }
  // De-dupe consecutive entries.
  const last = STATE.traceHistory[STATE.traceHistory.length - 1];
  if (!last || last.name !== ref.name || last.file !== ref.file || last.lineNum !== ref.lineNum) {
    STATE.traceHistory.push(ref);
  }
  STATE.traceHistoryIdx = STATE.traceHistory.length - 1;
}

export function gotoTraceHistory(idx) {
  if (idx < 0 || idx >= STATE.traceHistory.length) return;
  STATE.traceHistoryIdx = idx;
  STATE.traceRoot = STATE.traceHistory[idx];
  STATE.selectedPath = STATE.traceRoot.file;
}

export function clearTraceHistory(fn) {
  // Resets history with `fn` as the new origin. Used when the user explicitly
  // starts a new trace from the sidebar function list.
  const ref = fn ? fnToTraceRoot(fn) : null;
  STATE.traceRoot = ref;
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
export function setTraceRoot(fn) { pushTraceRoot(fn); }
export function setTraceView(v) { STATE.traceView = v === 'graph' ? 'graph' : 'tree'; }
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
