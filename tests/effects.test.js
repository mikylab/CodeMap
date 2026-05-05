import { test, assertTrue, assertFalse, assertDeepEqual } from './runner.js';
import { parseFile } from '../src/parser.js';
import { analyze } from '../src/analyzer.js';
import { computeEffects } from '../src/effects.js';
import { fnKey } from '../src/trace-graph.js';

function buildState(files) {
  const parsed = files.map(f => parseFile(f.name, f.src, f.path)).filter(Boolean);
  const analysis = analyze(parsed);
  const allFns = parsed.flatMap(f => f.fns);
  const fnByKey = new Map(allFns.map(fn => [fnKey(fn), fn]));
  return { files: parsed, allFns, fnByKey, ...analysis };
}

function tagsFor(state, fileName, fnName) {
  const fn = state.allFns.find(f => f.name === fnName && f.file.endsWith(fileName));
  if (!fn) throw new Error(`fn not found: ${fnName} in ${fileName}`);
  const e = state.effects.get(fnKey(fn));
  return e ? { direct: [...e.direct].sort(), inherited: [...e.inherited].sort() } : null;
}

test('effects: js import used → fn tagged', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `import fs from 'fs';\nfunction save(x) {\n  fs.writeFileSync('/tmp/x', x);\n}\n`,
  }]);
  computeEffects(state);
  const t = tagsFor(state, 'a.js', 'save');
  assertTrue(t.direct.includes('fs'), `expected fs in direct, got ${t.direct}`);
});

test('effects: js import unused → fn NOT tagged', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `import fs from 'fs';\nfunction add(a, b) {\n  return a + b;\n}\n`,
  }]);
  computeEffects(state);
  const t = tagsFor(state, 'a.js', 'add');
  assertFalse(t.direct.includes('fs'), `did not expect fs, got ${t.direct}`);
});

test('effects: js call-pattern without import → tagged (dom)', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `function show(id) {\n  return document.getElementById(id);\n}\n`,
  }]);
  computeEffects(state);
  const t = tagsFor(state, 'a.js', 'show');
  assertTrue(t.direct.includes('dom'));
});

test('effects: pattern inside string literal → NOT tagged', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `function help() {\n  const msg = "use document.getElementById to find nodes";\n  return msg;\n}\n`,
  }]);
  computeEffects(state);
  const t = tagsFor(state, 'a.js', 'help');
  assertFalse(t.direct.includes('dom'), `did not expect dom, got ${t.direct}`);
});

test('effects: pattern inside line comment → NOT tagged', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `function help() {\n  // could call document.getElementById here later\n  return 1;\n}\n`,
  }]);
  computeEffects(state);
  const t = tagsFor(state, 'a.js', 'help');
  assertFalse(t.direct.includes('dom'));
});

test('effects: process.env tagged as env', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `function getKey() {\n  return process.env.API_KEY;\n}\n`,
  }]);
  computeEffects(state);
  const t = tagsFor(state, 'a.js', 'getKey');
  assertTrue(t.direct.includes('env'));
});

test('effects: python import used → fn tagged (net)', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `import requests\n\ndef fetch(url):\n    return requests.get(url).json()\n`,
  }]);
  computeEffects(state);
  const t = tagsFor(state, 'a.py', 'fetch');
  assertTrue(t.direct.includes('net'), `got ${JSON.stringify(t)}`);
});

test('effects: python subprocess → exec', () => {
  const state = buildState([{
    name: 'a.py', path: 'a.py',
    src: `import subprocess\n\ndef run(cmd):\n    subprocess.run(cmd, check=True)\n`,
  }]);
  computeEffects(state);
  const t = tagsFor(state, 'a.py', 'run');
  assertTrue(t.direct.includes('exec'));
});

test('effects: destructured js import binding tracked', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `import { writeFile } from 'fs/promises';\nasync function save(x) {\n  await writeFile('/tmp/x', x);\n}\n`,
  }]);
  computeEffects(state);
  const t = tagsFor(state, 'a.js', 'save');
  assertTrue(t.direct.includes('fs'));
});

test('effects: propagation — caller inherits callee tag', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `import fs from 'fs';\nfunction save(x) {\n  fs.writeFileSync('/tmp/x', x);\n}\nfunction handler(x) {\n  save(x);\n}\nfunction outer(x) {\n  handler(x);\n}\n`,
  }]);
  computeEffects(state);
  const save = tagsFor(state, 'a.js', 'save');
  const handler = tagsFor(state, 'a.js', 'handler');
  const outer = tagsFor(state, 'a.js', 'outer');
  assertTrue(save.direct.includes('fs'));
  assertFalse(save.inherited.includes('fs'), 'direct seed should not also be inherited');
  assertTrue(handler.inherited.includes('fs'));
  assertTrue(outer.inherited.includes('fs'));
});

test('effects: propagation cycle-safe', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `function a() { b(); }\nfunction b() { a(); document.getElementById('x'); }\n`,
  }]);
  computeEffects(state);
  // Should terminate and tag both with dom — b directly, a inherited.
  const tA = tagsFor(state, 'a.js', 'a');
  const tB = tagsFor(state, 'a.js', 'b');
  assertTrue(tB.direct.includes('dom'));
  assertTrue(tA.inherited.includes('dom'));
});

test('effects: fileEffects aggregates over fns', () => {
  const state = buildState([{
    name: 'a.js', path: 'a.js',
    src: `import fs from 'fs';\nfunction a() { fs.readFileSync('/x'); }\nfunction b() { document.getElementById('y'); }\n`,
  }]);
  computeEffects(state);
  const fe = state.fileEffects.get('a.js');
  assertTrue(fe.direct.has('fs'));
  assertTrue(fe.direct.has('dom'));
});

test('effects: deterministic across two runs', () => {
  const mk = () => buildState([{
    name: 'a.js', path: 'a.js',
    src: `import fs from 'fs';\nfunction a() { fs.readFileSync('/x'); b(); }\nfunction b() { a(); }\n`,
  }]);
  const s1 = mk(); computeEffects(s1);
  const s2 = mk(); computeEffects(s2);
  const dump = s => [...s.effects.entries()]
    .map(([k, v]) => [k, [...v.direct].sort(), [...v.inherited].sort()])
    .sort((a, b) => a[0].localeCompare(b[0]));
  assertDeepEqual(dump(s1), dump(s2));
});
