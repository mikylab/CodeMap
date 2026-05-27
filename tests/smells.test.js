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

test('smells: Python narrow except (specific types) is info, not warn', () => {
  // EAFP fallback idiom: try int / except (ValueError, TypeError): pass / try float
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `def _coerce(v):\n    try:\n        return int(v)\n    except (ValueError, TypeError):\n        pass\n    return v\n`,
  }]);
  const out = detectSmells(state);
  const hit = out.find(h => h.kind === 'empty-catch' && h.file === 'a.py');
  assertTrue(!!hit, `expected an empty-catch finding; got ${JSON.stringify(out)}`);
  assertEqual(hit.subkind, 'narrow');
  assertEqual(hit.severity, 'info');
});

test('smells: Python broad except Exception stays warn', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `def f():\n    try:\n        do()\n    except Exception:\n        pass\n`,
  }]);
  const out = detectSmells(state);
  const hit = out.find(h => h.kind === 'empty-catch' && h.file === 'a.py');
  assertTrue(!!hit, 'expected an empty-catch finding');
  assertEqual(hit.subkind, 'empty');
  assertEqual(hit.severity, 'warn');
});

test('smells: Python relative import of sibling package NOT flagged', () => {
  // from .core import X  in pkg/__init__.py  ->  pkg/core/__init__.py
  const state = buildState([
    { name: '__init__.py', path: 'pkg/__init__.py',
      src: `from .core import Experiment, finish_experiment\n` },
    { name: '__init__.py', path: 'pkg/core/__init__.py',
      src: `from .db import finish_experiment\nclass Experiment: pass\n` },
    { name: 'db.py', path: 'pkg/core/db.py',
      src: `def finish_experiment(): pass\n` },
  ]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'broken-import' && h.file === 'pkg/__init__.py'),
    `.core resolves to pkg/core/__init__.py; got ${JSON.stringify(findKind(out, 'broken-import'))}`);
});

test('smells: Python relative import of sibling module NOT flagged', () => {
  // from .notebook import x  in pkg/__init__.py  ->  pkg/notebook.py
  const state = buildState([
    { name: '__init__.py', path: 'pkg/__init__.py',
      src: `from .notebook import load_ipython_extension as _load\n` },
    { name: 'notebook.py', path: 'pkg/notebook.py',
      src: `def load_ipython_extension(ip): pass\n` },
  ]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'broken-import' && h.file === 'pkg/__init__.py'),
    `.notebook resolves to pkg/notebook.py; got ${JSON.stringify(findKind(out, 'broken-import'))}`);
});

test('smells: Python relative import that truly resolves to nothing IS flagged', () => {
  const state = buildState([
    { name: '__init__.py', path: 'pkg/__init__.py',
      src: `from .nonexistent import thing\n` },
  ]);
  const out = detectSmells(state);
  assertTrue(out.some(h => h.kind === 'broken-import' && h.file === 'pkg/__init__.py'),
    `.nonexistent has no target and should be flagged`);
});

test('smells: Python local var via dispatch.get NOT flagged', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `dispatch = {}\ndef run(action):\n    handler = dispatch.get(action)\n    if handler:\n        handler()\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'handler'),
    `handler is a local binding; got ${JSON.stringify(out.filter(h => h.kind === 'unresolved-call'))}`);
});

test('smells: Python module-level alias assignment NOT flagged', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `def other_name():\n    return 1\n_name = other_name\ndef use():\n    return _name()\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === '_name'),
    `_name is a module-level alias; got ${JSON.stringify(out.filter(h => h.kind === 'unresolved-call'))}`);
});

test('smells: Python conditional module-level binding NOT flagged', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `try:\n    from c import impl\nexcept ImportError:\n    impl = None\ndef run():\n    return impl()\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'impl'),
    `impl is bound on both branches; got ${JSON.stringify(out.filter(h => h.kind === 'unresolved-call'))}`);
});

test('smells: Python for-loop variable NOT flagged', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `def run(items):\n    for cb in items:\n        cb()\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'cb'),
    `cb is bound by the for-loop; got ${JSON.stringify(out.filter(h => h.kind === 'unresolved-call'))}`);
});

test('smells: Python for-loop tuple unpacking NOT flagged', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `def run(pairs):\n    for key, fn in pairs:\n        fn(key)\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'fn'),
    `fn is bound by tuple unpacking; got ${JSON.stringify(out.filter(h => h.kind === 'unresolved-call'))}`);
});

test('smells: Python with-as binding NOT flagged', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `def run(ctx):\n    with ctx as svc:\n        svc()\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'svc'),
    `svc is bound by with...as; got ${JSON.stringify(out.filter(h => h.kind === 'unresolved-call'))}`);
});

test('smells: Python except-as binding NOT flagged', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `def run():\n    try:\n        do()\n    except Exception as err:\n        err()\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'err'),
    `err is bound by except...as; got ${JSON.stringify(out.filter(h => h.kind === 'unresolved-call'))}`);
});

test('smells: Python walrus binding NOT flagged', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `def run(get):\n    if (cb := get()):\n        cb()\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'cb'),
    `cb is bound by walrus; got ${JSON.stringify(out.filter(h => h.kind === 'unresolved-call'))}`);
});

test('smells: Python *args param NOT flagged when called', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `def run(*handlers):\n    for h in handlers:\n        h()\n    handlers()\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'handlers'),
    `*handlers binds 'handlers'; got ${JSON.stringify(out.filter(h => h.kind === 'unresolved-call'))}`);
});

test('smells: Python comprehension for-target NOT flagged', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `def run(items):\n    return [cb() for cb in items]\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'cb'),
    `cb is bound by comprehension; got ${JSON.stringify(out.filter(h => h.kind === 'unresolved-call'))}`);
});

test('smells: Python renamed from-import NOT flagged', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `from x import foo as bar\ndef run():\n    return bar()\n`,
  }]);
  const out = detectSmells(state);
  assertFalse(out.some(h => h.kind === 'unresolved-call' && h.subkind === 'bar'),
    `bar is the local alias; got ${JSON.stringify(out.filter(h => h.kind === 'unresolved-call'))}`);
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
