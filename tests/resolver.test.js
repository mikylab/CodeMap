import { test, assertEqual } from './runner.js';
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
