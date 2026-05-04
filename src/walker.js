import { basename } from './dom.js';
import { fnKey } from './trace-graph.js';

const ENTRY_RE = /\b(main|index|app|run|server|cli|__main__)\b/i;
const UTIL_RE = /\b(utils?|helpers?|common|shared|libs?|tools?|core)\b/i;
const CONFIG_RE = /\b(configs?|settings?|schemas?|constants?|env|types?|interfaces?)\b/i;
const TEST_RE = /(^|\/)tests?\/|(^|\/)__tests__\/|\.test\.|\.spec\.|(^|\/)test_|_test\.|_spec\./i;
const HOT_CX = 7;
const HOP_FANOUT_MIN = 1;
const ENTRY_REACH_MIN = 3;

const BOUNDARY_LIBS = new Set([
  // network / http
  'requests','httpx','urllib','urllib3','aiohttp','axios','node-fetch','got','superagent',
  'http','https','net','socket','websocket','websockets','ws',
  // filesystem / shell
  'fs','path','os','subprocess','shutil','pathlib','child_process',
  // databases
  'sqlite3','sqlalchemy','psycopg2','psycopg','pymssql','pyodbc','pymongo','redis',
  'pg','mysql','mysql2','mongodb','mongoose','sequelize','knex','prisma','typeorm',
  // cloud
  'boto3','botocore','aws-sdk','@aws-sdk','azure','google-cloud','googleapiclient','firebase',
]);

const ARCHETYPES = [
  { id: 'web',     name: 'Web service',          libs: ['fastapi','flask','django','starlette','express','koa','fastify','hapi','axum','actix-web','actix','gin','echo','fiber','rocket','sinatra','rails','spring','spring-boot'], note: 'This is a web service. Look for route handlers (decorators / route registrations) — they are the real entry points the framework calls.' },
  { id: 'cli',     name: 'Command-line tool',    libs: ['argparse','click','typer','docopt','clap','cobra','commander','yargs','inquirer','oclif'], note: 'This is a CLI. Subcommands and argument parsers define the entry points; trace from each subcommand handler.' },
  { id: 'worker',  name: 'Worker / job runner',  libs: ['celery','rq','dramatiq','sidekiq','bull','bullmq','huey','arq'], note: 'This is a worker. Look for task definitions — each registered task is an independent entry point.' },
  { id: 'desktop', name: 'Desktop / GUI app',    libs: ['electron','tauri','tkinter','pyqt','pyside','wx','gtk'], note: 'This is a desktop app. Window/component setup is the entry; event handlers drive the rest.' },
];

export function generateWalk(state) {
  const files = state.files || [];
  const fanIn = state.fanIn || new Map();
  const fanOut = state.fanOut || new Map();
  const callsByFn = state.callsByFn || new Map();
  const fileImporters = state.fileImporters || new Map();

  const steps = [];
  steps.push(overview(files));

  const arch = detectArchetype(files);
  if (arch) steps.push(archetypeStep(arch, files));

  const entries = pickEntries(files, fanIn, callsByFn);
  if (entries.length) steps.push(entryStep(entries));

  const hop = firstHop(entries, callsByFn, fanOut);
  if (hop) steps.push(hopStep(hop));

  if (files.length) steps.push(coreStep(files, fileImporters));

  const boundary = files.filter(f => isBoundary(f)).sort(byPath);
  if (boundary.length) steps.push(boundaryStep(boundary));

  const hotspots = collectHotspots(files, fanIn);
  if (hotspots.length) steps.push(hotspotStep(hotspots));

  const utils = files.filter(f => UTIL_RE.test(stem(f.path))).sort(byPath);
  if (utils.length) steps.push(utilStep(utils));

  const cfg = files.filter(f => CONFIG_RE.test(stem(f.path))).sort(byPath);
  if (cfg.length) steps.push(configStep(cfg));

  const orphans = pickOrphans(files, fileImporters, fanIn);
  if (orphans.length) steps.push(orphanStep(orphans));

  steps.push(depsStep(files));
  return steps;
}

// ---------- archetype ----------

function detectArchetype(files) {
  const libs = new Set();
  for (const f of files) for (const im of (f.imports || [])) libs.add(im.lib);
  const hits = [];
  for (const arch of ARCHETYPES) {
    const matched = arch.libs.filter(l => libs.has(l));
    if (matched.length) hits.push({ arch, matched: matched.sort() });
  }
  if (!hits.length) return null;
  return hits.sort((a, b) => a.arch.id.localeCompare(b.arch.id));
}

function archetypeStep(hits, files) {
  const names = hits.map(h => `${h.arch.name} (${h.matched.join(', ')})`).join('; ');
  const noteParts = hits.map(h => h.arch.note);
  // Surface files that import any matched lib so the chip row points at the right entry surface.
  const matchedLibs = new Set(hits.flatMap(h => h.matched));
  const relevant = files
    .filter(f => (f.imports || []).some(im => matchedLibs.has(im.lib)))
    .map(f => f.path)
    .sort();
  return {
    title: 'Project archetype',
    category: 'archetype',
    content: `Detected: ${names}.`,
    files: relevant,
    fns: [],
    note: noteParts.join(' '),
  };
}

// ---------- entry ----------

function pickEntries(files, fanIn, callsByFn) {
  // Two signals: filename hints + functions with no callers but real outgoing reach.
  // Union them, rank by reach desc, fall back to filename-only when graph is empty.
  const filenameHits = files.filter(f => ENTRY_RE.test(stem(f.path)));
  const graphCandidates = [];
  for (const f of files) {
    for (const fn of f.fns) {
      const key = fnKey(fn);
      if ((fanIn.get(key) || 0) > 0) continue;
      const reach = transitiveReach(key, callsByFn);
      if (reach >= ENTRY_REACH_MIN) graphCandidates.push({ fn, file: f, reach });
    }
  }
  graphCandidates.sort((a, b) => b.reach - a.reach || a.file.path.localeCompare(b.file.path) || a.fn.lineNum - b.fn.lineNum);

  // Combine: take graph candidates whose file matches filename hints first, then top-reach others.
  const filenameSet = new Set(filenameHits.map(f => f.path));
  const inFilename = graphCandidates.filter(c => filenameSet.has(c.file.path));
  const others = graphCandidates.filter(c => !filenameSet.has(c.file.path)).slice(0, 5);
  const combined = [...inFilename, ...others];

  if (combined.length) return combined;
  // Fallback: filename-only, no fn data.
  return filenameHits.sort(byPath).map(f => ({ fn: null, file: f, reach: 0 }));
}

function entryStep(entries) {
  const filePaths = uniq(entries.map(e => e.file.path));
  const namedFns = entries.filter(e => e.fn).slice(0, 6).map(e => e.fn.name);
  const summary = entries
    .slice(0, 4)
    .map(e => e.fn ? `${e.fn.name} (${e.file.path}, reach ${e.reach})` : e.file.path)
    .join('; ');
  return {
    title: 'Entry points',
    category: 'entry',
    content: `${entries.length} likely entry${entries.length === 1 ? '' : ' point'}: ${summary}.`,
    files: filePaths,
    fns: namedFns,
    note: 'Execution starts here. Click a function chip to trace what it calls.',
  };
}

// ---------- first hop ----------

function firstHop(entries, callsByFn, fanOut) {
  const top = entries.find(e => e.fn);
  if (!top) return null;
  const edges = callsByFn.get(fnKey(top.fn)) || [];
  const callees = [];
  const seen = new Set();
  for (const e of edges) {
    if (!e.resolved || !e.target) continue;
    if (seen.has(e.target)) continue;
    seen.add(e.target);
    callees.push({ name: e.name, target: e.target, fanOut: fanOut.get(e.target) || 0 });
  }
  if (callees.length < HOP_FANOUT_MIN) return null;
  callees.sort((a, b) => b.fanOut - a.fanOut || a.name.localeCompare(b.name));
  return { from: top, callees: callees.slice(0, 6) };
}

function hopStep(hop) {
  const fromName = hop.from.fn.name;
  const summary = hop.callees
    .map(c => `${c.name} (fan-out ${c.fanOut})`)
    .join(', ');
  return {
    title: `First hop from ${fromName}`,
    category: 'hop',
    content: `${fromName} branches into ${hop.callees.length} in-codebase function${hop.callees.length === 1 ? '' : 's'}: ${summary}.`,
    files: uniq(hop.callees.map(c => c.target.split('::')[0])),
    fns: hop.callees.map(c => c.name),
    note: 'These are the trunks of the execution tree. Click a chip to follow one branch deeper in Trace.',
  };
}

// ---------- core ----------

function coreStep(files, fileImporters) {
  // Most-imported files first; fall back to lineCount if no import edges resolved.
  const ranked = files
    .map(f => ({ f, importers: (fileImporters.get(f.path) || new Set()).size }))
    .sort((a, b) => b.importers - a.importers || b.f.lineCount - a.f.lineCount || a.f.path.localeCompare(b.f.path));
  const useGraph = ranked.length > 0 && ranked[0].importers > 0;
  if (useGraph) {
    const top = ranked.slice(0, 3);
    return {
      title: 'Core modules',
      category: 'core',
      content: `Most-imported files: ${top.map(r => `${r.f.path} (${r.importers} importer${r.importers === 1 ? '' : 's'})`).join(', ')}.`,
      files: top.map(r => r.f.path),
      fns: [],
      note: 'These are load-bearing — many files depend on them. Changes here ripple widely.',
    };
  }
  const top = [...files].sort((a, b) => b.lineCount - a.lineCount || a.path.localeCompare(b.path)).slice(0, 3);
  return {
    title: 'Core modules',
    category: 'core',
    content: `Largest by line count: ${top.map(f => `${f.path} (${f.lineCount})`).join(', ')}.`,
    files: top.map(f => f.path),
    fns: [],
    note: 'Big files usually concentrate domain logic. Read these once you know the entry points.',
  };
}

// ---------- boundary ----------

function isBoundary(f) {
  for (const im of (f.imports || [])) if (BOUNDARY_LIBS.has(im.lib)) return true;
  return false;
}

function boundaryStep(files) {
  const libsByFile = files.map(f => {
    const libs = (f.imports || []).map(i => i.lib).filter(l => BOUNDARY_LIBS.has(l)).sort();
    return { path: f.path, libs: uniq(libs) };
  });
  const summary = libsByFile.slice(0, 5).map(x => `${x.path} (${x.libs.join(', ')})`).join('; ');
  return {
    title: 'Boundary — where side effects live',
    category: 'boundary',
    content: `${files.length} file${files.length === 1 ? '' : 's'} touch network, filesystem, or DB: ${summary}.`,
    files: files.map(f => f.path),
    fns: [],
    note: 'Bugs cluster at the boundary. Check these first when behavior depends on the outside world.',
  };
}

// ---------- hotspots ----------

function collectHotspots(files, fanIn) {
  const hot = [];
  for (const f of files) {
    for (const fn of f.fns) {
      if (fn.cx < HOT_CX) continue;
      const callers = fanIn.get(fnKey(fn)) || 0;
      hot.push({ file: f, fn, callers, weight: fn.cx * (1 + callers) });
    }
  }
  return hot.sort((a, b) =>
    b.weight - a.weight ||
    b.fn.cx - a.fn.cx ||
    a.file.path.localeCompare(b.file.path) ||
    a.fn.name.localeCompare(b.fn.name)
  );
}

function hotspotStep(hotspots) {
  const files = uniq(hotspots.map(h => h.file.path));
  const top = hotspots.slice(0, 5);
  const fmt = top
    .map(h => `${h.fn.name} (${h.file.path}, cx ${h.fn.cx}, called from ${h.callers})`)
    .join('; ');
  return {
    title: 'Complexity hotspots',
    category: 'complexity',
    content: `${hotspots.length} function${hotspots.length === 1 ? '' : 's'} with cx ≥ ${HOT_CX}, ranked by complexity × callers. Top: ${fmt}.`,
    files,
    fns: top.map(h => h.fn.name),
    note: 'High branching AND widely called. Refactor candidates and likely bug magnets.',
  };
}

// ---------- utils / config ----------

function utilStep(utils) {
  return {
    title: 'Utilities',
    category: 'utils',
    content: `${utils.length} utility-like file${utils.length === 1 ? '' : 's'}: ${utils.map(f => f.path).join(', ')}.`,
    files: utils.map(f => f.path),
    fns: [],
    note: 'Shared helpers. Often imported widely — changes here ripple.',
  };
}

function configStep(cfg) {
  return {
    title: 'Config & schema',
    category: 'config',
    content: `${cfg.length} config/schema file${cfg.length === 1 ? '' : 's'}: ${cfg.map(f => f.path).join(', ')}.`,
    files: cfg.map(f => f.path),
    fns: [],
    note: 'Read these to learn the shape of data and runtime knobs.',
  };
}

// ---------- orphans ----------

function pickOrphans(files, fileImporters, fanIn) {
  const out = [];
  for (const f of files) {
    if (TEST_RE.test(f.path)) continue;
    if (ENTRY_RE.test(stem(f.path))) continue;
    const importers = fileImporters.get(f.path);
    if (importers && importers.size > 0) continue;
    const anyCalled = (f.fns || []).some(fn => (fanIn.get(fnKey(fn)) || 0) > 0);
    if (anyCalled) continue;
    out.push(f);
  }
  return out.sort(byPath);
}

function orphanStep(orphans) {
  const sample = orphans.slice(0, 8).map(f => f.path).join(', ');
  return {
    title: 'Orphans — possibly dead or stand-alone',
    category: 'orphans',
    content: `${orphans.length} file${orphans.length === 1 ? '' : 's'} with no detected importers and no called functions: ${sample}${orphans.length > 8 ? '…' : ''}.`,
    files: orphans.map(f => f.path),
    fns: [],
    note: 'Likely dead code, scripts, or untested modules. Verify before refactoring.',
  };
}

// ---------- overview / deps ----------

function overview(files) {
  const langs = new Map();
  let lines = 0, fns = 0;
  for (const f of files) {
    langs.set(f.lang, (langs.get(f.lang) || 0) + 1);
    lines += f.lineCount;
    fns += f.fns.length;
  }
  const langSummary = [...langs.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([n, c]) => `${n} (${c})`)
    .join(', ') || 'none';
  return {
    title: 'Project overview',
    category: 'meta',
    content: `${files.length} files · ${lines} lines · ${fns} functions · languages: ${langSummary}.`,
    files: files.map(f => f.path).sort(),
    fns: [],
    note: 'Skim the language mix and file count to set scale expectations before diving in.',
  };
}

function depsStep(files) {
  const counts = new Map();
  for (const f of files) for (const im of f.imports) counts.set(im.lib, (counts.get(im.lib) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = sorted.slice(0, 8);
  const summary = top.length
    ? top.map(([lib, n]) => `${lib} (${n})`).join(', ')
    : 'no external imports detected';
  return {
    title: 'External dependencies',
    category: 'deps',
    content: `${sorted.length} unique external lib${sorted.length === 1 ? '' : 's'}. Most-used: ${summary}.`,
    files: [],
    fns: [],
    note: 'The libraries used reveal the project’s technical posture at a glance.',
  };
}

// ---------- helpers ----------

function transitiveReach(rootKey, callsByFn) {
  const seen = new Set([rootKey]);
  const queue = [rootKey];
  let count = 0;
  while (queue.length && count < 200) {
    const k = queue.shift();
    const edges = callsByFn.get(k) || [];
    for (const e of edges) {
      if (!e.resolved || !e.target) continue;
      if (seen.has(e.target)) continue;
      seen.add(e.target);
      queue.push(e.target);
      count++;
    }
  }
  return count;
}

function stem(path) { return basename(path).replace(/\.[^.]+$/, ''); }
function uniq(arr) { return [...new Set(arr)]; }
function byPath(a, b) { return a.path.localeCompare(b.path); }
