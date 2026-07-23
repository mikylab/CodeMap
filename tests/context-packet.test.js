import { test, assertTrue, assertFalse, assertEqual } from './runner.js';
import { parseFile } from '../src/parser.js';
import { analyze } from '../src/analyzer.js';
import { detectSmells } from '../src/smells.js';
import {
  fileMatchesZone, matchesAnyZone, packetModel, renderMarkdown, contextPacket,
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
