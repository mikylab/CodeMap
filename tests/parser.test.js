import { test, assertEqual, assertDeepEqual, assertNull, assertTrue, assertFalse } from './runner.js';
import { parseFile, shouldSkipPath } from '../src/parser.js';

test('python: extracts def names, ignores keywords', () => {
  const src = `def foo():\n    if True:\n        return 1\ndef bar(x): return x\n`;
  const out = parseFile('mod.py', src, 'pkg/mod.py');
  assertEqual(out.lang, 'Python');
  assertDeepEqual(out.fns.map(f => f.name).sort(), ['bar', 'foo']);
  assertEqual(out.fns.find(f => f.name === 'if'), undefined);
});

test('python: extracts imports and normalizes dotted', () => {
  const src = `import os\nfrom torch.nn import functional\n`;
  const out = parseFile('a.py', src, 'a.py');
  const libs = out.imports.map(i => i.lib).sort();
  assertTrue(libs.includes('torch'));
  assertTrue(libs.includes('os'));
});

test('js: extracts function and arrow names, ignores keywords', () => {
  const src = `function foo() {}\nconst bar = (x) => x;\nif (x) {}\n`;
  const out = parseFile('a.js', src, 'a.js');
  const names = out.fns.map(f => f.name);
  assertTrue(names.includes('foo'));
  assertTrue(names.includes('bar'));
  assertFalse(names.includes('if'));
});

test('js: extracts ES module imports', () => {
  const src = `import React from 'react';\nimport { x } from './local';\nconst a = require('lodash');\n`;
  const out = parseFile('a.js', src, 'a.js');
  const libs = out.imports.map(i => i.lib).sort();
  assertDeepEqual(libs, ['lodash', 'react']);
});

test('ts: extracts functions', () => {
  const src = `function greet(): void {}\nexport const fetchData = async () => 1;\n`;
  const out = parseFile('a.ts', src, 'a.ts');
  assertEqual(out.lang, 'TypeScript');
  const names = out.fns.map(f => f.name);
  assertTrue(names.includes('greet'));
  assertTrue(names.includes('fetchData'));
});

test('ts: import keyword false positive', () => {
  const src = `if (foo) { return 1; }\n`;
  const out = parseFile('a.ts', src, 'a.ts');
  assertEqual(out.fns.length, 0);
});

test('python: docstring prose does not create phantom functions', () => {
  // `class\s+(\w+)` must not reach across the blank line into the docstring:
  // "...Experiment class\n\nOne Experiment = ..." once created a fn named "One".
  const src = `"""\nmod.py — Experiment class\n\nOne Experiment = one run.\nCaptures: params, git state (branch + diff).\n"""\ndef real_fn():\n    return 1\n`;
  const out = parseFile('experiment.py', src, 'core/experiment.py');
  const names = out.fns.map(f => f.name);
  assertDeepEqual(names, ['real_fn']);
  // ...and no phantom "state(" call leaks out of the imagined function body.
  assertFalse(out.fns.some(f => (f.calls || []).includes('state')));
});

test('python: except keyword not captured as a call', () => {
  const src = `def f():\n    try:\n        return int(v)\n    except (KeyError, TypeError) as e:\n        return None\n`;
  const out = parseFile('a.py', src, 'a.py');
  const allCalls = out.fns.flatMap(f => f.calls || []);
  assertFalse(allCalls.includes('except'));
});

test('go: extracts func names', () => {
  const src = `package main\nfunc main() {}\nfunc (s *S) Greet() {}\n`;
  const out = parseFile('m.go', src, 'm.go');
  const names = out.fns.map(f => f.name).sort();
  assertDeepEqual(names, ['Greet', 'main']);
});

test('go: extracts imports', () => {
  const src = `import "fmt"\nimport alias "encoding/json"\n`;
  const out = parseFile('m.go', src, 'm.go');
  const libs = out.imports.map(i => i.lib).sort();
  assertTrue(libs.includes('fmt'));
  assertTrue(libs.includes('encoding'));
});

test('go: keyword not captured as fn', () => {
  const src = `package x\nif true { }\n`;
  const out = parseFile('m.go', src, 'm.go');
  assertEqual(out.fns.length, 0);
});

test('rust: extracts fn/struct/enum', () => {
  const src = `fn foo() {}\nstruct Bar {}\nenum Baz {}\n`;
  const out = parseFile('a.rs', src, 'a.rs');
  const names = out.fns.map(f => f.name).sort();
  assertDeepEqual(names, ['Bar', 'Baz', 'foo']);
});

test('rust: extracts use imports', () => {
  const src = `use std::io;\nuse serde::Serialize;\n`;
  const out = parseFile('a.rs', src, 'a.rs');
  const libs = out.imports.map(i => i.lib).sort();
  assertTrue(libs.includes('std'));
  assertTrue(libs.includes('serde'));
});

test('rust: if not captured', () => {
  const src = `fn main() { if true {} }\n`;
  const out = parseFile('a.rs', src, 'a.rs');
  const names = out.fns.map(f => f.name);
  assertFalse(names.includes('if'));
});

test('ruby: extracts def/class/module', () => {
  const src = `module Greeter\n  class Hello\n    def greet; end\n  end\nend\n`;
  const out = parseFile('a.rb', src, 'a.rb');
  const names = out.fns.map(f => f.name).sort();
  assertDeepEqual(names, ['Greeter', 'Hello', 'greet']);
});

test('ruby: extracts require', () => {
  const src = `require 'json'\nrequire_relative './local'\n`;
  const out = parseFile('a.rb', src, 'a.rb');
  const libs = out.imports.map(i => i.lib);
  assertDeepEqual(libs, ['json']);
});

test('ruby: if not captured', () => {
  const src = `if true\n  puts 1\nend\n`;
  const out = parseFile('a.rb', src, 'a.rb');
  assertEqual(out.fns.length, 0);
});

test('java: extracts method names', () => {
  const src = `public class A {\n  public void greet() { }\n  private int add(int a, int b) { return a + b; }\n}\n`;
  const out = parseFile('A.java', src, 'A.java');
  const names = out.fns.map(f => f.name).sort();
  assertTrue(names.includes('greet'));
  assertTrue(names.includes('add'));
});

test('java: extracts imports', () => {
  const src = `import java.util.List;\nimport com.example.Foo;\n`;
  const out = parseFile('A.java', src, 'A.java');
  const libs = out.imports.map(i => i.lib).sort();
  assertTrue(libs.includes('java'));
  assertTrue(libs.includes('com'));
});

test('java: if not captured', () => {
  const src = `class A { void m() { if (true) {} } }\n`;
  const out = parseFile('A.java', src, 'A.java');
  const names = out.fns.map(f => f.name);
  assertFalse(names.includes('if'));
});

test('returns null for unsupported extension', () => {
  assertNull(parseFile('a.xyz', 'whatever', 'a.xyz'));
});

test('skips node_modules and binary extensions', () => {
  assertTrue(shouldSkipPath('node_modules/x/index.js'));
  assertTrue(shouldSkipPath('img/logo.png'));
  assertTrue(shouldSkipPath('build/out.js'));
  assertTrue(shouldSkipPath('app.min.js'));
  assertFalse(shouldSkipPath('src/app.js'));
});

test('per-file complexity is clamped and finite', () => {
  const src = `def f():\n    if a and b or c:\n        for x in y:\n            while z: pass\n`;
  const out = parseFile('a.py', src, 'a.py');
  assertTrue(out.cx >= 1 && out.cx <= 30);
});

test('per-fn complexity reflects body branches', () => {
  const src = `def foo():\n    if a:\n        return 1\n    else:\n        return 2\n\ndef bar():\n    return 3\n`;
  const out = parseFile('m.py', src, 'm.py');
  const foo = out.fns.find(f => f.name === 'foo');
  const bar = out.fns.find(f => f.name === 'bar');
  assertTrue(foo.cx >= 2);
  assertEqual(bar.cx, 1);
});

test('per-fn cx is clamped to [1,30]', () => {
  const out = parseFile('a.js', `function noop(){}\n`, 'a.js');
  assertTrue(out.fns[0].cx >= 1 && out.fns[0].cx <= 30);
});

test('parser: extracts call sites from function body (js)', () => {
  const src = `function howMany(xs) {\n  const n = count(xs);\n  return isEven(n);\n}\n`;
  const out = parseFile('a.js', src, 'a.js');
  const fn = out.fns.find(f => f.name === 'howMany');
  assertTrue(Array.isArray(fn.calls));
  assertTrue(fn.calls.includes('count'));
  assertTrue(fn.calls.includes('isEven'));
});

test('parser: call extraction excludes control-flow keywords', () => {
  const src = `function go(x) {\n  if (x) { while(x) {} }\n  return foo(x);\n}\n`;
  const out = parseFile('a.js', src, 'a.js');
  const fn = out.fns[0];
  assertFalse(fn.calls.includes('if'));
  assertFalse(fn.calls.includes('while'));
  assertFalse(fn.calls.includes('return'));
  assertTrue(fn.calls.includes('foo'));
});

test('parser: call extraction excludes self-reference', () => {
  const src = `def foo():\n    return foo() + bar()\n`;
  const out = parseFile('m.py', src, 'm.py');
  const fn = out.fns.find(f => f.name === 'foo');
  assertFalse(fn.calls.includes('foo'));
  assertTrue(fn.calls.includes('bar'));
});

test('parser: localImports captures relative specs', () => {
  const src = `import x from './foo';\nimport y from '../bar/baz';\nimport z from 'react';\n`;
  const out = parseFile('a.js', src, 'src/a.js');
  assertTrue(out.localImports.includes('./foo'));
  assertTrue(out.localImports.includes('../bar/baz'));
  assertFalse(out.localImports.includes('react'));
});

test('parser: python `from pkg import a, b` emits dotted specs', () => {
  const src = `from src import formatters, helpers\nfrom pkg.sub import Thing as T\nimport os\n`;
  const out = parseFile('m.py', src, 'm.py');
  assertTrue(out.localImports.includes('src.formatters'));
  assertTrue(out.localImports.includes('src.helpers'));
  assertTrue(out.localImports.includes('pkg.sub.Thing'));
});

test('parser: calls list is sorted and deduped', () => {
  const src = `function go() { foo(); bar(); foo(); }\n`;
  const out = parseFile('a.js', src, 'a.js');
  assertDeepEqual(out.fns[0].calls, ['bar', 'foo']);
});
