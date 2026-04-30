const ENTRY_RE = /\b(main|index|app|run|server|cli|__main__)\b/i;
const UTIL_RE = /\b(utils?|helpers?|common|shared|libs?|tools?|core)\b/i;
const CONFIG_RE = /\b(configs?|settings?|schemas?|constants?|env|types?|interfaces?)\b/i;
const HOT_CX = 7;

export function generateWalk(state) {
  const files = state.files || [];
  const steps = [];
  steps.push(overview(files));
  const entries = files.filter(f => ENTRY_RE.test(stem(f.path))).sort(byPath);
  if (entries.length) steps.push(entryStep(entries));
  if (files.length) steps.push(coreStep(files));
  const hotspots = collectHotspots(files);
  if (hotspots.length) steps.push(hotspotStep(hotspots));
  const utils = files.filter(f => UTIL_RE.test(stem(f.path))).sort(byPath);
  if (utils.length) steps.push(utilStep(utils));
  const cfg = files.filter(f => CONFIG_RE.test(stem(f.path))).sort(byPath);
  if (cfg.length) steps.push(configStep(cfg));
  steps.push(depsStep(files));
  return steps;
}

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

function entryStep(entries) {
  return {
    title: 'Entry points',
    category: 'entry',
    content: `${entries.length} likely entry file${entries.length === 1 ? '' : 's'}: ${entries.map(f => f.path).join(', ')}.`,
    files: entries.map(f => f.path),
    fns: [],
    note: 'Start reading here — these are where execution begins.',
  };
}

function coreStep(files) {
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

function collectHotspots(files) {
  const hot = [];
  for (const f of files) for (const fn of f.fns) if (fn.cx >= HOT_CX) hot.push({ file: f, fn });
  return hot.sort((a, b) => b.fn.cx - a.fn.cx || a.file.path.localeCompare(b.file.path) || a.fn.name.localeCompare(b.fn.name));
}

function hotspotStep(hotspots) {
  const files = uniq(hotspots.map(h => h.file.path));
  const top = hotspots.slice(0, 5);
  return {
    title: 'Complexity hotspots',
    category: 'complexity',
    content: `${hotspots.length} function${hotspots.length === 1 ? '' : 's'} with cx ≥ ${HOT_CX}. Top: ${top.map(h => `${h.fn.name} (${h.file.path}, cx ${h.fn.cx})`).join('; ')}.`,
    files,
    fns: top.map(h => h.fn.name),
    note: 'High branching density. Refactor candidates and likely bug magnets.',
  };
}

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

function stem(path) {
  const last = path.split(/[\\/]/).pop() || '';
  return last.replace(/\.[^.]+$/, '');
}

function uniq(arr) { return [...new Set(arr)]; }
function byPath(a, b) { return a.path.localeCompare(b.path); }
