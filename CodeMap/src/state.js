import { generateWalk } from './walker.js';
import { newSkipped } from './ingest.js';
import { fnKey } from './trace-graph.js';

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
  STATE.traceRoot = fnToTraceRoot(STATE.allFns[0]);
}

function indexByName(fns) {
  const m = new Map();
  for (const fn of fns) if (!m.has(fn.name)) m.set(fn.name, fn);
  return m;
}

function fnToTraceRoot(fn) {
  return fn ? { name: fn.name, file: fn.file, lineNum: fn.lineNum } : null;
}

export function selectPath(p) { STATE.selectedPath = p; }

export function setWalkIdx(i) {
  if (!STATE.walk.length) { STATE.walkIdx = 0; return; }
  STATE.walkIdx = Math.max(0, Math.min(STATE.walk.length - 1, i));
}

export function setActiveTab(name) { STATE.activeTab = name; }
export function setSidebarFilter(s) { STATE.sidebarFilter = s; }
export function setFunctionsSort(s) { STATE.functionsSort = s; }
export function setTraceRoot(fn) { STATE.traceRoot = fnToTraceRoot(fn); }
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
