#!/usr/bin/env node
// Headless task-context packet generator.
//
// Same pure core as the browser UI (parser → analyzer → smells → contextPacket),
// so a packet built here is byte-identical to one exported from the Smells view
// for the same inputs. Exists so a roadmap tool — specy-road, a git hook, CI —
// can turn a task's touch_zones into agent context without a browser.
//
// Usage:
//   node bin/codemap-packet.mjs [options] [zone ...]
//
//   --repo <dir>          repo root to scan (default: cwd)
//   --format md|toon      output format (default: md)
//   --triage <file>       JSON of triaged findings to exclude
//                         (default: <repo>/.codemap-triage.json when present)
//   --min-severity <s>    info | warn (default: info — everything)
//   --max-findings <n>    cap findings, most severe first (default: 0 = all)
//   --snippet-chars <n>   truncate snippets to n chars; 0 = full, -1 = omit
//   --call-graph <mode>   all | adjacent | none (default: all)
//   -o, --out <file>      write to file instead of stdout
//   --stats               print a size summary to stderr
//
// Zones are the paths the task touches. No zones = whole repo.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename, resolve } from 'node:path';
import { parseFile, shouldSkipPath } from '../src/parser.js';
import { analyze } from '../src/analyzer.js';
import { detectSmells } from '../src/smells.js';
import { contextPacket, packetModel } from '../src/context-packet.js';
import { parseTriageImport } from '../src/triage.js';

function parseArgs(argv) {
  const opts = {
    repo: process.cwd(), format: 'md', triage: null, out: null, stats: false,
    minSeverity: 'info', maxFindings: 0, snippetChars: 0, callGraph: 'all', zones: [],
  };
  const takes = {
    '--repo': 'repo', '--format': 'format', '--triage': 'triage', '-o': 'out', '--out': 'out',
    '--min-severity': 'minSeverity', '--max-findings': 'maxFindings',
    '--snippet-chars': 'snippetChars', '--call-graph': 'callGraph',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stats') { opts.stats = true; continue; }
    if (a === '-h' || a === '--help') { opts.help = true; continue; }
    if (a in takes) {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      opts[takes[a]] = v;
      continue;
    }
    if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
    // Bare args are zones; accept comma-separated too so a registry.yaml value
    // pastes in verbatim.
    opts.zones.push(...a.split(',').map(s => s.trim()).filter(Boolean));
  }
  opts.maxFindings = Number(opts.maxFindings) || 0;
  opts.snippetChars = Number(opts.snippetChars) || 0;
  return opts;
}

function walk(dir, root, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full);
    if (shouldSkipPath(rel)) continue;
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, root, out);
    else out.push(full);
  }
  return out;
}

function buildState(root) {
  const rootName = basename(root);
  const parsed = [];
  for (const abs of walk(root, root)) {
    // Prefix with the repo dir name so paths match what a drag-drop load
    // produces, and so zone matching behaves the same in both front-ends.
    const path = `${rootName}/${relative(root, abs).split(/[\\/]/).join('/')}`;
    let src;
    try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    const pf = parseFile(basename(abs), src, path);
    if (pf) parsed.push(pf);
  }
  const analysis = analyze(parsed);
  const state = {
    files: parsed,
    byPath: new Map(parsed.map(f => [f.path, f])),
    fnByKey: new Map(parsed.flatMap(f => f.fns.map(fn => [`${fn.file}::${fn.name}@${fn.lineNum}`, fn]))),
    dismissedSmells: new Set(),
    ...analysis,
  };
  state.smells = detectSmells(state);
  return state;
}

// Triage lives in a committed file, not localStorage, so a dismissal made once
// in the browser keeps applying to every later CLI run, for everyone.
function loadTriage(file, explicit) {
  if (!file || !existsSync(file)) {
    if (explicit) throw new Error(`triage file not found: ${file}`);
    return { set: new Set(), path: null };
  }
  const res = parseTriageImport(readFileSync(file, 'utf8'));
  if (!res.ok) throw new Error(`triage file ${file}: ${res.error}`);
  return { set: res.dismissed, path: file };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8')
      .split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
    return;
  }
  const root = resolve(opts.repo);
  const state = buildState(root);

  const explicitTriage = !!opts.triage;
  const triageFile = opts.triage ? resolve(opts.triage) : join(root, '.codemap-triage.json');
  const triage = loadTriage(triageFile, explicitTriage);
  state.dismissedSmells = triage.set;

  const limits = {
    minSeverity: opts.minSeverity, maxFindings: opts.maxFindings,
    snippetChars: opts.snippetChars, callGraph: opts.callGraph,
  };
  const out = contextPacket(state, { paths: opts.zones, format: opts.format, ...limits });

  if (opts.out) writeFileSync(opts.out, out);
  else process.stdout.write(out);

  if (opts.stats) {
    const m = packetModel(state, { paths: opts.zones, ...limits });
    const parts = [
      `files ${m.repo.matched.length}/${m.repo.fileCount}`,
      `findings ${m.budget.shown}/${m.budget.total}`,
      `fns ${m.budget.fnsShown}/${m.budget.fnsTotal}`,
      `chars ${out.length}`,
      `~tokens ${Math.round(out.length / 4)}`,
    ];
    if (m.budget.dismissed) parts.push(`triaged-out ${m.budget.dismissed}`);
    if (triage.path) parts.push(`triage ${relative(root, triage.path) || triage.path}`);
    console.error(`codemap-packet: ${parts.join(' · ')}`);
  }
}

try { main(); }
catch (e) { console.error(`codemap-packet: ${e.message}`); process.exit(1); }
