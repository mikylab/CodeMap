import { test, assertTrue, assertFalse, assertEqual } from './runner.js';
import { parseFile } from '../src/parser.js';
import { analyze } from '../src/analyzer.js';
import { detectSmells } from '../src/smells.js';

function buildState(files) {
  const parsed = files.map(f => parseFile(f.name, f.src, f.path)).filter(Boolean);
  const analysis = analyze(parsed);
  return { files: parsed, byPath: new Map(parsed.map(f => [f.path, f])), ...analysis };
}

function findKind(findings, kind, file) {
  return findings.filter(f => f.kind === kind && (!file || f.file === file));
}

test('smells: unresolved-call flagged for hallucinated name', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `function handle() {\n  validateToken(req);\n}\n`,
  }]);
  const out = detectSmells(state);
  const hits = findKind(out, 'unresolved-call', 'a.js');
  assertTrue(hits.some(h => h.subkind === 'validateToken'),
    `expected validateToken; got ${JSON.stringify(out)}`);
});

test('smells: function parameter not flagged as unresolved call', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `async def rate_limit_middleware(request, call_next):\n    return await call_next(request)\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'call_next'),
    `call_next is a parameter; should not be unresolved`);
});

test('smells: JS arrow param not flagged', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `const wrap = (handler) => {\n  return handler(42);\n};\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'handler'),
    `handler is a parameter; should not be unresolved`);
});

test('smells: Go receiver-style params not flagged', () => {
  const state = buildState([{
    name: 'a.go', path: 'a.go',
    src: `func (s *Server) Handle(next Handler) error {\n  return next()\n}\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'next'),
    `next is a parameter; should not be unresolved`);
});

test('smells: builtin Math.floor not flagged', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `function r(x) {\n  return Math.floor(x);\n}\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'Math'),
    `Math should be in builtins`);
});

test('smells: TODO comment is suspicious (info)', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `function f() {\n  // TODO: handle the rate limit\n  return 1;\n}\n`,
  }]);
  const out = detectSmells(state);
  const hit = out.find(h => h.kind === 'suspicious-comment');
  assertTrue(!!hit, 'expected a suspicious-comment finding');
  assertEqual(hit.subkind, 'TODO');
  assertEqual(hit.severity, 'info');
});

test('smells: HACK comment is warn', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `// HACK: figure this out later\nfunction f() { return 1; }\n`,
  }]);
  const out = detectSmells(state);
  const hit = out.find(h => h.kind === 'suspicious-comment');
  assertEqual(hit.subkind, 'HACK');
  assertEqual(hit.severity, 'warn');
});

test('smells: empty JS catch flagged', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `function f() {\n  try { doIt(); } catch (e) { }\n}\n`,
  }]);
  const out = detectSmells(state);
  assertTrue(out.some(h => h.kind === 'empty-catch'), `expected empty-catch in ${JSON.stringify(out)}`);
});

test('smells: handled JS catch NOT flagged', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `function f() {\n  try { doIt(); } catch (e) { logger.error(e); throw e; }\n}\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'empty-catch'),
    `did not expect empty-catch; got ${JSON.stringify(out.filter(o=>o.kind==='empty-catch'))}`);
});

test('smells: localhost placeholder flagged', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `const URL = "http://localhost:3000/api";\nfunction f() { return URL; }\n`,
  }]);
  const out = detectSmells(state);
  assertTrue(out.some(h => h.kind === 'placeholder' && h.subkind === 'localhost'),
    `expected localhost; got ${JSON.stringify(out)}`);
});

test('smells: YOUR_API_KEY placeholder flagged', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `const KEY = "YOUR_API_KEY";\nfunction f() { return KEY; }\n`,
  }]);
  const out = detectSmells(state);
  assertTrue(out.some(h => h.kind === 'placeholder' && h.subkind === 'env-stub'));
});

test('smells: Python pass-only except is empty-catch', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `def f():\n    try:\n        do()\n    except Exception:\n        pass\n`,
  }]);
  const out = detectSmells(state);
  assertTrue(out.some(h => h.kind === 'empty-catch'));
});

test('smells: deterministic & sorted', () => {
  const state = buildState([{
    name: 'b.js', path: 'b.js',
    src: `// TODO later\nfunction f() { try { x(); } catch (e) {} }\n`,
  }]);
  const a = detectSmells(state);
  const b = detectSmells(state);
  assertEqual(JSON.stringify(a), JSON.stringify(b));
  // warns come before infos
  const sevs = a.map(f => f.severity);
  const firstInfo = sevs.indexOf('info');
  const lastWarn = sevs.lastIndexOf('warn');
  if (firstInfo >= 0 && lastWarn >= 0) {
    assertTrue(lastWarn < firstInfo || firstInfo === -1, 'warn must precede info');
  }
});

test('smells: stable id across runs', () => {
  const mk = () => buildState([{
    name: 'a.js', path: 'a.js',
    src: `// TODO same\nfunction f() {}\n`,
  }]);
  const a = detectSmells(mk());
  const b = detectSmells(mk());
  assertEqual(a[0].id, b[0].id);
});
