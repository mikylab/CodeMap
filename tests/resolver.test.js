import { test, assertEqual, assertTrue } from './runner.js';
import { resolve } from '../src/resolver.js';

function makeState({ files = [], resolveIndex = new Map() } = {}) {
  const byPath = new Map(files.map(f => [f.path, f]));
  return { files, byPath, resolveIndex };
}

test('resolver: language keyword returns null', () => {
  const state = makeState();
  const r = resolve('if', { path: 'a.py', ext: 'py' }, 1, null, state);
  assertEqual(r, null);
});

test('resolver: builtin recognized when in LANG_CONFIG[lang].builtins', () => {
  const state = makeState();
  const r = resolve('print', { path: 'a.py', ext: 'py' }, 1, null, state);
  assertEqual(r.kind, 'builtin');
  assertEqual(r.language, 'Python');
});

test('resolver: unknown token returns unresolved', () => {
  const state = makeState();
  const r = resolve('mystery_thing_xyz', { path: 'a.py', ext: 'py' }, 1, null, state);
  assertEqual(r.kind, 'unresolved');
});

test('resolver: token is a param of the enclosing fn', () => {
  const fn = { name: 'handle', params: [{ name: 'req' }, { name: 'res' }], locals: [] };
  const file = { path: 'a.py', ext: 'py' };
  const state = makeState({ resolveIndex: new Map() });
  const r = resolve('req', file, 5, fn, state);
  assertEqual(r.kind, 'param');
  assertEqual(r.context, 'handle');
});

test('resolver: token is a local of the enclosing fn', () => {
  const fn = { name: 'handle', params: [], locals: ['user', 'config'] };
  const file = { path: 'a.py', ext: 'py' };
  const state = makeState({ resolveIndex: new Map() });
  const r = resolve('user', file, 5, fn, state);
  assertEqual(r.kind, 'local');
  assertEqual(r.context, 'handle');
});

test('resolver: param shadows same-file function — warning attached', () => {
  const fn = { name: 'handle', params: [{ name: 'log' }], locals: [] };
  const file = { path: 'a.py', ext: 'py' };
  const resolveIndex = new Map([['log', [{ kind: 'function', file: 'a.py', lineNum: 3 }]]]);
  const state = makeState({ resolveIndex });
  const r = resolve('log', file, 5, fn, state);
  assertEqual(r.kind, 'param');
  assertTrue(r.shadowed != null, 'shadowed present');
  assertEqual(r.shadowed.kind, 'function');
  assertEqual(r.shadowed.lineNum, 3);
});

test('resolver: local does not flag shadow when no same-file def exists', () => {
  const fn = { name: 'handle', params: [], locals: ['user'] };
  const file = { path: 'a.py', ext: 'py' };
  const state = makeState({ resolveIndex: new Map() });
  const r = resolve('user', file, 5, fn, state);
  assertEqual(r.kind, 'local');
  assertEqual(r.shadowed, undefined);
});
