import { test, assertEqual, assertTrue } from './runner.js';
import { annotateFile } from '../src/source-annotate.js';

function makeState(files) {
  const byPath = new Map(files.map(f => [f.path, f]));
  const resolveIndex = new Map();
  for (const f of files) {
    for (const fn of (f.fns || [])) {
      let arr = resolveIndex.get(fn.name);
      if (!arr) resolveIndex.set(fn.name, arr = []);
      arr.push({ kind: 'function', file: f.path, lineNum: fn.lineNum });
    }
    for (const im of (f.imports || [])) {
      let arr = resolveIndex.get(im.lib);
      if (!arr) resolveIndex.set(im.lib, arr = []);
      arr.push({ kind: 'import', file: f.path, lineNum: 1, lib: im.lib });
    }
  }
  return { files, byPath, resolveIndex };
}

test('source-annotate: resolved cross-file function call has function kind', () => {
  const target = { name: 'helper', file: 'b.js', lineNum: 1, lines: 1, params: [], locals: [] };
  const caller = { name: 'caller', file: 'a.js', lineNum: 1, lines: 2, params: [], locals: [] };
  const files = [
    { path: 'a.js', ext: 'js', src: `function caller() {\n  helper();\n}\n`, fns: [caller], imports: [] },
    { path: 'b.js', ext: 'js', src: `function helper(){}`, fns: [target], imports: [] },
  ];
  const ann = annotateFile(files[0], makeState(files));
  const line2 = ann.byLine.get(2) || [];
  const helper = line2.find(a => a.label === 'helper');
  assertTrue(helper != null);
  assertEqual(helper.kind, 'function');
  assertEqual(helper.file, 'b.js');
});

test('source-annotate: unknown token flagged as unresolved', () => {
  const fn = { name: 'caller', file: 'a.js', lineNum: 1, lines: 1, params: [], locals: [] };
  const files = [{ path: 'a.js', ext: 'js', src: `function caller(){ mystery_thing_xyz(); }`,
                   fns: [fn], imports: [] }];
  const ann = annotateFile(files[0], makeState(files));
  const flat = [...ann.byLine.values()].flat();
  const myst = flat.find(a => a.label === 'mystery_thing_xyz');
  assertTrue(myst != null);
  assertEqual(myst.kind, 'unresolved');
});

test('source-annotate: param identifier annotated as param', () => {
  const fn = { name: 'go', file: 'a.js', lineNum: 1, lines: 2,
               params: [{ name: 'req' }], locals: [] };
  const files = [{ path: 'a.js', ext: 'js', src: `function go(req) {\n  return req.body;\n}\n`,
                   fns: [fn], imports: [] }];
  const ann = annotateFile(files[0], makeState(files));
  const line2 = ann.byLine.get(2) || [];
  const req = line2.find(a => a.label === 'req');
  assertTrue(req != null);
  assertEqual(req.kind, 'param');
});

test('source-annotate: builtin (console) tagged when in LANG_CONFIG.js.builtins', () => {
  const fn = { name: 'go', file: 'a.js', lineNum: 1, lines: 2, params: [], locals: [] };
  const files = [{ path: 'a.js', ext: 'js', src: `function go() {\n  console.log(1);\n}\n`,
                   fns: [fn], imports: [] }];
  const ann = annotateFile(files[0], makeState(files));
  const line2 = ann.byLine.get(2) || [];
  const c = line2.find(a => a.label === 'console');
  assertTrue(c != null);
  assertEqual(c.kind, 'builtin');
});

test('source-annotate: same name, two cross-file matches → ambiguous', () => {
  const callerFn = { name: 'go', file: 'a.js', lineNum: 1, lines: 2, params: [], locals: [] };
  const t1 = { name: 'helper', file: 'b.js', lineNum: 1, lines: 1, params: [], locals: [] };
  const t2 = { name: 'helper', file: 'c.js', lineNum: 1, lines: 1, params: [], locals: [] };
  const files = [
    { path: 'a.js', ext: 'js', src: `function go() {\n  helper();\n}\n`, fns: [callerFn], imports: [] },
    { path: 'b.js', ext: 'js', src: `function helper(){}`, fns: [t1], imports: [] },
    { path: 'c.js', ext: 'js', src: `function helper(){}`, fns: [t2], imports: [] },
  ];
  const ann = annotateFile(files[0], makeState(files));
  const line2 = ann.byLine.get(2) || [];
  const helper = line2.find(a => a.label === 'helper');
  assertTrue(helper != null);
  assertEqual(helper.kind, 'ambiguous');
  assertEqual(helper.candidates.length, 2);
});
