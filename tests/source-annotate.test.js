import { test, assertEqual, assertDeepEqual, assertTrue } from './runner.js';
import { annotateFile } from '../src/source-annotate.js';

function makeState(files) {
  const byPath = new Map(files.map(f => [f.path, f]));
  const fnByName = new Map();
  const fnByKey = new Map();
  for (const f of files) for (const fn of (f.fns || [])) {
    if (!fnByName.has(fn.name)) fnByName.set(fn.name, fn);
    fnByKey.set(`${f.path}::${fn.name}`, fn);
  }
  return { files, byPath, fnByName, fnByKey };
}

test('annotate: resolved call site emits annotation with target fnKey', () => {
  const target = { name: 'helper', file: 'b.js', lineNum: 1, lines: 1 };
  const callerSrc = `function caller() {\n  helper();\n}\n`;
  const caller = { name: 'caller', file: 'a.js', lineNum: 1, lines: 2 };
  const files = [
    { path: 'a.js', src: callerSrc, fns: [caller], imports: [] },
    { path: 'b.js', src: `function helper(){}`, fns: [target], imports: [] },
  ];
  const ann = annotateFile(files[0], makeState(files));
  const line2 = ann.byLine.get(2) || [];
  assertEqual(line2.length, 1);
  assertEqual(line2[0].kind, 'call');
  assertEqual(line2[0].target, 'b.js::helper');
  assertEqual(line2[0].label, 'helper');
});

test('annotate: unresolved call gets unresolved conf, no target', () => {
  const callerSrc = `function caller(){ mystery(); }`;
  const files = [{ path: 'a.js', src: callerSrc, imports: [], fns: [{
    name: 'caller', file: 'a.js', lineNum: 1, lines: 1,
  }] }];
  const ann = annotateFile(files[0], makeState(files));
  const flat = [...ann.byLine.values()].flat();
  const myst = flat.find(a => a.label === 'mystery');
  assertTrue(myst != null);
  assertEqual(myst.conf, 'unresolved');
});

test('annotate: keyword call sites are skipped', () => {
  const callerSrc = `function caller(){ if (x) return; for (i=0;i<3;i++){} }`;
  const files = [{ path: 'a.js', src: callerSrc, imports: [], fns: [{
    name: 'caller', file: 'a.js', lineNum: 1, lines: 1,
  }] }];
  const ann = annotateFile(files[0], makeState(files));
  const flat = [...ann.byLine.values()].flat();
  assertEqual(flat.find(a => a.label === 'if'), undefined);
  assertEqual(flat.find(a => a.label === 'for'), undefined);
});

test('annotate: annotations sorted by col asc, no overlaps', () => {
  const target = { name: 'helper', file: 'b.js', lineNum: 1, lines: 1 };
  const callerSrc = `function caller(){ helper(helper(1), helper(2)); }`;
  const caller = { name: 'caller', file: 'a.js', lineNum: 1, lines: 1 };
  const files = [
    { path: 'a.js', src: callerSrc, imports: [], fns: [caller] },
    { path: 'b.js', src: ``, imports: [], fns: [target] },
  ];
  const ann = annotateFile(files[0], makeState(files));
  const line1 = ann.byLine.get(1) || [];
  assertTrue(line1.length >= 3);
  for (let i = 1; i < line1.length; i++) {
    assertTrue(line1[i].col >= line1[i - 1].col + line1[i - 1].len);
  }
});
