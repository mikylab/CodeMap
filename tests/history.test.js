import { test, assertEqual, assertDeepEqual } from './runner.js';
import { STATE, pushHistory, popHistory, clearHistory, captureSnapshot, restoreSnapshot, selectFile, selectFn, setDetailMode, clearSelection } from '../src/state.js';

function reset() { clearHistory(); }

test('history: push appends snapshot', () => {
  reset();
  pushHistory({ kind: 'file', path: 'a.js', mode: 'summary' });
  assertEqual(STATE.history.length, 1);
  assertEqual(STATE.history[0].path, 'a.js');
});

test('history: pop returns last snapshot and shrinks', () => {
  reset();
  pushHistory({ kind: 'file', path: 'a.js', mode: 'summary' });
  pushHistory({ kind: 'fn', fnKey: 'a.js::foo', mode: 'source' });
  const back = popHistory();
  assertEqual(back.fnKey, 'a.js::foo');
  assertEqual(STATE.history.length, 1);
});

test('history: cap at 20', () => {
  reset();
  for (let i = 0; i < 25; i++) pushHistory({ kind: 'file', path: `f${i}.js`, mode: 'summary' });
  assertEqual(STATE.history.length, 20);
  assertEqual(STATE.history[0].path, 'f5.js');
  assertEqual(STATE.history[19].path, 'f24.js');
});

test('history: clear empties the stack', () => {
  reset();
  pushHistory({ kind: 'file', path: 'a.js', mode: 'summary' });
  clearHistory();
  assertDeepEqual(STATE.history, []);
});

test('history: push de-dupes identical consecutive snapshots', () => {
  reset();
  pushHistory({ kind: 'file', path: 'a.js', mode: 'summary' });
  pushHistory({ kind: 'file', path: 'a.js', mode: 'summary' });
  assertEqual(STATE.history.length, 1);
});

test('history: captureSnapshot reflects current selection', () => {
  clearSelection();
  setDetailMode('summary');
  assertDeepEqual(captureSnapshot(), { kind: 'repo', mode: 'summary' });

  selectFile('src/parser.js');
  setDetailMode('source');
  assertDeepEqual(captureSnapshot(), { kind: 'file', path: 'src/parser.js', mode: 'source' });
});

test('history: restoreSnapshot updates selection + mode', () => {
  clearSelection();
  restoreSnapshot({ kind: 'file', path: 'a.js', mode: 'risk' });
  assertEqual(STATE.selectedPath, 'a.js');
  assertEqual(STATE.selectedFnKey, null);
  assertEqual(STATE.detailMode, 'risk');

  restoreSnapshot({ kind: 'repo', mode: 'summary' });
  assertEqual(STATE.selectedPath, null);
  assertEqual(STATE.selectedFnKey, null);
});
