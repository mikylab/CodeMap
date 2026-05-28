import { test, assertEqual, assertTrue, assertFalse } from './runner.js';
import { dismissKey, repoIdentity, loadDismissed, saveDismissed, clearStoredTriage } from '../src/triage.js';

test('triage: dismissKey is stable when only line changes', () => {
  const a = { file: 'a.js', line: 10, kind: 'unresolved-call', subkind: 'foo', snippet: 'foo(x)' };
  const b = { file: 'a.js', line: 42, kind: 'unresolved-call', subkind: 'foo', snippet: 'foo(x)' };
  assertEqual(dismissKey(a), dismissKey(b));
});

test('triage: dismissKey differs when file changes', () => {
  const a = { file: 'a.js', line: 10, kind: 'unresolved-call', subkind: 'foo', snippet: 'foo(x)' };
  const b = { file: 'b.js', line: 10, kind: 'unresolved-call', subkind: 'foo', snippet: 'foo(x)' };
  assertTrue(dismissKey(a) !== dismissKey(b));
});

test('triage: dismissKey differs when kind changes', () => {
  const a = { file: 'a.js', line: 10, kind: 'unresolved-call', subkind: 'foo', snippet: 'foo(x)' };
  const b = { file: 'a.js', line: 10, kind: 'placeholder',     subkind: 'foo', snippet: 'foo(x)' };
  assertTrue(dismissKey(a) !== dismissKey(b));
});

test('triage: dismissKey differs when snippet changes', () => {
  const a = { file: 'a.js', line: 10, kind: 'unresolved-call', subkind: 'foo', snippet: 'foo(x)' };
  const b = { file: 'a.js', line: 10, kind: 'unresolved-call', subkind: 'foo', snippet: 'foo(y)' };
  assertTrue(dismissKey(a) !== dismissKey(b));
});

test('triage: dismissKey tolerates missing subkind/snippet', () => {
  const a = { file: 'a.js', line: 1, kind: 'broken-import' };
  const k = dismissKey(a);
  assertTrue(typeof k === 'string' && k.length > 0);
});

test('triage: repoIdentity uses git meta when present', () => {
  const state = {
    lastRepoMeta: { host: 'github.com', owner: 'foo', repo: 'bar', ref: 'main' },
    files: [],
  };
  assertEqual(repoIdentity(state), 'git:github.com/foo/bar@main');
});

test('triage: repoIdentity falls back to local fingerprint', () => {
  const state = {
    lastRepoMeta: null,
    files: [{ path: 'pkg/a.js' }, { path: 'pkg/b.js' }],
  };
  const id = repoIdentity(state);
  assertTrue(id.startsWith('local:pkg:'), `got ${id}`);
});

test('triage: repoIdentity returns null for empty state', () => {
  const state = { lastRepoMeta: null, files: [] };
  assertEqual(repoIdentity(state), null);
});

test('triage: local fingerprint is stable across path order', () => {
  const a = { lastRepoMeta: null, files: [{ path: 'pkg/a.js' }, { path: 'pkg/b.js' }] };
  const b = { lastRepoMeta: null, files: [{ path: 'pkg/b.js' }, { path: 'pkg/a.js' }] };
  assertEqual(repoIdentity(a), repoIdentity(b));
});

// localStorage shim for tests that may run in environments where it's missing.
// In a browser test it's real localStorage. Tests use unique repo ids so they
// don't collide.
function freshKey(prefix) { return `${prefix}-${Math.random().toString(36).slice(2)}`; }

test('triage: saveDismissed + loadDismissed round-trip a Set', () => {
  const repoId = freshKey('test-repo');
  const set = new Set(['abc', 'def']);
  saveDismissed(repoId, set);
  const loaded = loadDismissed(repoId);
  assertTrue(loaded instanceof Set);
  assertEqual(loaded.size, 2);
  assertTrue(loaded.has('abc'));
  assertTrue(loaded.has('def'));
  clearStoredTriage(repoId);
});

test('triage: loadDismissed returns empty Set when nothing stored', () => {
  const repoId = freshKey('missing');
  const loaded = loadDismissed(repoId);
  assertTrue(loaded instanceof Set);
  assertEqual(loaded.size, 0);
});

test('triage: loadDismissed tolerates malformed JSON', () => {
  const repoId = freshKey('bad');
  try { localStorage.setItem(`codemap:triage:${repoId}`, '{not json'); } catch {}
  const loaded = loadDismissed(repoId);
  assertTrue(loaded instanceof Set);
  assertEqual(loaded.size, 0);
  clearStoredTriage(repoId);
});

test('triage: saveDismissed with null repoId is a no-op', () => {
  // Must not throw.
  saveDismissed(null, new Set(['x']));
  assertEqual(loadDismissed(null).size, 0);
});
