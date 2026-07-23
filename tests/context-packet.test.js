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
