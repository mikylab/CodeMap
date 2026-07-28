import { test, assertTrue, assertFalse, assertEqual } from './runner.js';
import { parseFile } from '../src/parser.js';
import { analyze } from '../src/analyzer.js';
import { detectSmells } from '../src/smells.js';
import {
  fileMatchesZone, matchesAnyZone, packetModel, renderMarkdown, renderToon, contextPacket,
} from '../src/context-packet.js';

function buildState(files) {
  const parsed = files.map(f => parseFile(f.name, f.src, f.path)).filter(Boolean);
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

const FILES = [
  { name: 'api.js', path: 'repo/src/api/api.js',
    src: `import { fmt } from '../util/fmt.js';\nexport function handle(req) {\n  if (req) { return fmt(req); }\n  return validateToken(req); // hallucinated\n}\n` },
  { name: 'fmt.js', path: 'repo/src/util/fmt.js',
    src: `export function fmt(x) {\n  return String(x);\n}\n` },
  { name: 'ui.js', path: 'repo/src/ui/ui.js',
    src: `export function draw() { return 1; }\n` },
];

test('context: fileMatchesZone matches segment-boundary sub-paths', () => {
  assertTrue(fileMatchesZone('repo/src/api/api.js', 'src/api'));
  assertTrue(fileMatchesZone('repo/src/api/api.js', 'repo/src/api'));
  assertFalse(fileMatchesZone('repo/src/api/api.js', 'src/ap'));
  assertFalse(fileMatchesZone('repo/src/ui/ui.js', 'src/api'));
});

test('context: empty zones select the whole repo', () => {
  assertTrue(matchesAnyZone('anything/at/all.js', []));
});

test('context: packetModel scopes files to the requested zones', () => {
  const state = buildState(FILES);
  const model = packetModel(state, { paths: ['src/api'] });
  assertEqual(model.files.length, 1);
  assertEqual(model.files[0].path, 'repo/src/api/api.js');
  assertTrue(model.repo.matched.includes('repo/src/api/api.js'));
});

test('context: packetModel excludes findings outside the scope', () => {
  const state = buildState(FILES);
  const model = packetModel(state, { paths: ['src/ui'] });
  assertFalse(model.findings.some(f => f.file === 'repo/src/api/api.js'));
});

test('context: dismissed findings are excluded', async () => {
  const state = buildState(FILES);
  const hit = state.smells.find(s => s.kind === 'unresolved-call');
  assertTrue(!!hit, 'fixture should produce an unresolved-call');
  // Re-dismiss via the same key the model filters on.
  const { dismissKey } = await import('../src/triage.js');
  state.dismissedSmells = new Set([dismissKey(hit)]);
  const model = packetModel(state, { paths: ['src/api'] });
  assertFalse(model.findings.some(f => f.id === hit.id));
});

test('context: markdown packet is non-empty and names the scope', () => {
  const state = buildState(FILES);
  const md = contextPacket(state, { paths: ['src/api'], format: 'md' });
  assertTrue(md.includes('repo/src/api/api.js'));
  assertTrue(md.includes('src/api'));
});

test('context: same input yields byte-identical markdown', () => {
  const state = buildState(FILES);
  const a = contextPacket(state, { paths: ['src/api'] });
  const b = contextPacket(state, { paths: ['src/api'] });
  assertEqual(a, b);
});

test('context: toon packet is tabular and deterministic', () => {
  const state = buildState(FILES);
  const t1 = contextPacket(state, { paths: ['src/api'], format: 'toon' });
  const t2 = contextPacket(state, { paths: ['src/api'], format: 'toon' });
  assertEqual(t1, t2);                         // deterministic
  assertTrue(t1.includes('files['));           // tabular array header
  assertTrue(t1.includes('repo/src/api/api.js'));
  assertFalse(t1.includes('# Codemap task context')); // not markdown
});

test('context: toon and markdown encode the same scope', () => {
  const state = buildState(FILES);
  const md = contextPacket(state, { paths: ['src/api'], format: 'md' });
  const tn = contextPacket(state, { paths: ['src/api'], format: 'toon' });
  assertTrue(md.includes('repo/src/api/api.js') && tn.includes('repo/src/api/api.js'));
});

test('context: markdown renders cross-boundary call edges', () => {
  const state = buildState(FILES);
  const model = packetModel(state, { paths: ['src/api'] });
  assertTrue(model.crossEdges.length > 0, 'fixture should produce a cross-boundary edge');
  const md = renderMarkdown(model);
  assertTrue(md.includes('## Boundary calls'));
  assertTrue(md.includes('fmt'));
});

test('context: toon renders boundaryEdges as a tabular block', () => {
  const state = buildState(FILES);
  const model = packetModel(state, { paths: ['src/api'] });
  const tn = renderToon(model);
  assertTrue(tn.includes('boundaryEdges['));
  assertTrue(tn.includes('fmt'));
});

test('context: markdown/toon determinism holds with boundary calls rendered', () => {
  const state = buildState(FILES);
  const a = contextPacket(state, { paths: ['src/api'], format: 'md' });
  const b = contextPacket(state, { paths: ['src/api'], format: 'md' });
  assertEqual(a, b);
  const t1 = contextPacket(state, { paths: ['src/api'], format: 'toon' });
  const t2 = contextPacket(state, { paths: ['src/api'], format: 'toon' });
  assertEqual(t1, t2);
});

test('context: toon empty scalar array has no trailing space', () => {
  const state = buildState(FILES);
  // No paths ⇒ whole repo, so repo.zones (rendered as scalar array "zones") is empty.
  const model = packetModel(state, { paths: [] });
  assertEqual(model.repo.zones.length, 0);
  const tn = renderToon(model);
  const zonesLine = tn.split('\n').find(l => l.trim().startsWith('zones['));
  assertTrue(!!zonesLine, 'expected a zones[] line');
  assertFalse(/ $/.test(zonesLine), `line should not have a trailing space: ${JSON.stringify(zonesLine)}`);
  assertTrue(/\[0\]:$/.test(zonesLine));
});

test('context: toon quotes values containing commas and double-quotes', () => {
  const state = buildState(FILES);
  const model = packetModel(state, { paths: ['src/api'] });
  // Inject a why-string with a comma and a double-quote to exercise RFC4180-style escaping.
  model.findings.push({
    file: 'repo/src/api/api.js', line: 1, kind: 'test-kind', subkind: '',
    severity: 'low', fnName: 'handle', why: 'has a comma, and a "quote"',
  });
  const tn = renderToon(model);
  assertTrue(tn.includes('"has a comma, and a ""quote"""'));
});

// ---- Budget caps -----------------------------------------------------------

// Two severities: FIXME => warn, TODO => info (see smells.js SUSPICIOUS handling).
const CAP_FILES = [
  { name: 'a.js', path: 'repo/src/api/a.js',
    src: `export function alpha(x) {\n  // FIXME real problem\n  // TODO later\n  if (x) { return bravo(x); }\n  return missingOne(x);\n}\nexport function bravo(y) {\n  // TODO also later\n  return String(y);\n}\n` },
  { name: 'b.js', path: 'repo/src/ui/b.js',
    src: `export function charlie() {\n  // TODO ui cleanup\n  return 2;\n}\n` },
];

test('context: default limits reproduce the uncapped packet', () => {
  const state = buildState(CAP_FILES);
  assertEqual(contextPacket(state, { paths: ['src/api'] }),
              contextPacket(state, { paths: ['src/api'], minSeverity: 'info', maxFindings: 0, callGraph: 'all' }));
});

test('context: minSeverity=warn drops info findings and says how many', () => {
  const state = buildState(CAP_FILES);
  const all = packetModel(state, { paths: ['src/api'] });
  const warn = packetModel(state, { paths: ['src/api'], minSeverity: 'warn' });
  assertTrue(all.findings.some(f => f.severity === 'info'), 'fixture should produce an info finding');
  assertFalse(warn.findings.some(f => f.severity === 'info'));
  assertEqual(warn.budget.droppedBySeverity, all.findings.length - warn.findings.length);
  assertTrue(renderMarkdown(warn).includes('below severity `warn`'));
});

test('context: maxFindings caps the list and discloses the omission', () => {
  const state = buildState(CAP_FILES);
  const full = packetModel(state, { paths: ['src/api'] });
  assertTrue(full.findings.length > 1, 'fixture should produce several findings');
  const capped = packetModel(state, { paths: ['src/api'], maxFindings: 1 });
  assertEqual(capped.findings.length, 1);
  assertEqual(capped.budget.droppedByCap, full.findings.length - 1);
  assertTrue(renderMarkdown(capped).includes('max-findings cap'));
});

test('context: capping keeps the most severe findings first', () => {
  const state = buildState(CAP_FILES);
  const capped = packetModel(state, { paths: ['src/api'], maxFindings: 1 });
  assertEqual(capped.findings[0].severity, 'warn');
});

test('context: snippetChars truncates, -1 omits snippets', () => {
  const state = buildState(CAP_FILES);
  const clipped = packetModel(state, { paths: ['src/api'], snippetChars: 5 });
  assertTrue(clipped.findings.every(f => !f.snippet || f.snippet.length <= 6));
  const none = packetModel(state, { paths: ['src/api'], snippetChars: -1 });
  assertTrue(none.findings.every(f => !f.snippet));
  assertFalse(renderMarkdown(none).includes('- Snippet:'));
});

test('context: callGraph=none drops the section, hotspots and boundary survive', () => {
  const state = buildState(CAP_FILES);
  const full = packetModel(state, { paths: ['src/api'] });
  const none = packetModel(state, { paths: ['src/api'], callGraph: 'none' });
  assertEqual(none.fns.length, 0);
  assertEqual(none.crossEdges.length, full.crossEdges.length);
  assertEqual(none.hotspots.length, full.hotspots.length);
  assertFalse(renderMarkdown(none).includes('## Call graph'));
});

test('context: callGraph=adjacent keeps only implicated functions', () => {
  const state = buildState(CAP_FILES);
  const adj = packetModel(state, { paths: ['src/api'], callGraph: 'adjacent' });
  const full = packetModel(state, { paths: ['src/api'] });
  assertTrue(adj.fns.length <= full.fns.length);
  assertEqual(adj.budget.fnsTotal, full.fns.length);
  assertEqual(adj.budget.fnsShown, adj.fns.length);
});

test('context: triaged findings are counted and flagged as do-not-report', async () => {
  const state = buildState(CAP_FILES);
  const { dismissKey } = await import('../src/triage.js');
  const hit = state.smells.find(s => s.file === 'repo/src/api/a.js');
  state.dismissedSmells = new Set([dismissKey(hit)]);
  const model = packetModel(state, { paths: ['src/api'] });
  assertEqual(model.budget.dismissed, 1);
  const md = renderMarkdown(model);
  assertTrue(md.includes('Do not re-report them.'));
  assertTrue(renderToon(model).includes('do not re-report'));
});

test('context: capped packets stay byte-identical across runs', () => {
  const state = buildState(CAP_FILES);
  const opts = { paths: ['src/api'], format: 'toon', minSeverity: 'warn', maxFindings: 2, snippetChars: 40, callGraph: 'adjacent' };
  assertEqual(contextPacket(state, opts), contextPacket(state, opts));
});

test('context: unknown limit values fall back to defaults', () => {
  const state = buildState(CAP_FILES);
  const bogus = packetModel(state, { paths: ['src/api'], minSeverity: 'nope', callGraph: 'sideways' });
  assertEqual(bogus.limits.minSeverity, 'info');
  assertEqual(bogus.limits.callGraph, 'all');
});
