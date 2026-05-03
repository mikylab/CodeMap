import { generateWalk } from './walker.js';

const EMPTY_ANALYSIS = { edges: [], degree: new Map(), libToPaths: new Map() };

export const STATE = {
  files: [],
  byPath: new Map(),
  allFns: [],
  fnByName: new Map(),
  selectedPath: null,
  edges: [],
  degree: new Map(),
  libToPaths: new Map(),
  walk: [],
  walkIdx: 0,
  activeTab: 'overview',
  sidebarFilter: '',
  functionsSort: 'cx',
  traceRoot: null,
};

export function setFiles(files, analysis = EMPTY_ANALYSIS) {
  STATE.files = files;
  STATE.byPath = new Map(files.map(f => [f.path, f]));
  STATE.allFns = files.flatMap(f => f.fns);
  STATE.fnByName = indexByName(STATE.allFns);
  STATE.selectedPath = null;
  STATE.edges = analysis.edges;
  STATE.degree = analysis.degree;
  STATE.libToPaths = analysis.libToPaths;
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
