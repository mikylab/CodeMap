import { test, assertEqual, assertDeepEqual, assertTrue } from './runner.js';
import { parseFile } from '../src/parser.js';
import { buildFlow } from '../src/flow.js';

function fakeState(parsed) {
  const fnByKey = new Map();
  const fnByName = new Map();
  const byPath = new Map();
  for (const f of parsed) {
    byPath.set(f.path, f);
    for (const fn of f.fns) {
      const key = `${fn.file}::${fn.name}`;
      fnByKey.set(key, fn);
      if (!fnByName.has(fn.name)) fnByName.set(fn.name, fn);
    }
  }
  const callsByFn = new Map();
  const callersByFn = new Map();
  for (const f of parsed) {
    for (const fn of f.fns) {
      const fromKey = `${fn.file}::${fn.name}`;
      for (const callee of fn.calls) {
        const target = fnByName.get(callee);
        if (!target) continue;
        const toKey = `${target.file}::${target.name}`;
        const calls = callsByFn.get(fromKey) || [];
        calls.push({ target: toKey, resolved: true, confidence: 'high' });
        callsByFn.set(fromKey, calls);
        const callers = callersByFn.get(toKey) || [];
        callers.push({ from: fromKey, confidence: 'high' });
        callersByFn.set(toKey, callers);
      }
    }
  }
  const effects = new Map();
  for (const fn of fnByKey.values()) {
    effects.set(`${fn.file}::${fn.name}`, {
      direct: new Set(), inherited: new Set(),
      directions: {
        read:  { direct: new Set(), inherited: new Set() },
        write: { direct: new Set(), inherited: new Set() },
      },
    });
  }
  return { byPath, fnByKey, fnByName, callsByFn, callersByFn, effects };
}

test('flow: returns params, doc, callerArgs', () => {
  const callee = parseFile('a.py', `def parse(data, opts=None):\n    """Doc."""\n    return data\n`, 'a.py');
  const caller = parseFile('b.py', `def main():\n    ast = parse(raw_text, default_opts)\n`, 'b.py');
  const flow = buildFlow(callee.fns[0], fakeState([callee, caller]));
  assertEqual(flow.params.length, 2);
  assertEqual(flow.params[0].name, 'data');
  assertTrue(flow.doc.includes('Doc.'));
  assertEqual(flow.callerArgs.length, 1);
  assertDeepEqual(flow.callerArgs[0].args, ['raw_text', 'default_opts']);
});

test('flow: caller binding lhs assignment captured', () => {
  const callee = parseFile('a.py', `def parse(data):\n    return data\n`, 'a.py');
  const caller = parseFile('b.py', `def main():\n    ast = parse(raw_text)\n`, 'b.py');
  const flow = buildFlow(callee.fns[0], fakeState([callee, caller]));
  assertEqual(flow.callerBindings[0].binding, 'lhs');
  assertEqual(flow.callerBindings[0].text, 'ast');
});

test('flow: caller binding return form captured', () => {
  const callee = parseFile('a.py', `def parse(data):\n    return data\n`, 'a.py');
  const caller = parseFile('b.py', `def wrap():\n    return parse(x)\n`, 'b.py');
  const flow = buildFlow(callee.fns[0], fakeState([callee, caller]));
  assertEqual(flow.callerBindings[0].binding, 'return');
});

test('flow: returns expressions extracted', () => {
  const callee = parseFile('a.py', `def parse(data):\n    if not data:\n        return None\n    return data.upper()\n`, 'a.py');
  const flow = buildFlow(callee.fns[0], fakeState([callee]));
  assertEqual(flow.returns.length, 2);
  assertTrue(flow.returns.some(r => r.expr.includes('None')));
  assertTrue(flow.returns.some(r => r.expr.includes('data.upper')));
});

test('flow: function with no callers produces empty callerArgs', () => {
  const callee = parseFile('a.py', `def lone():\n    return 1\n`, 'a.py');
  const flow = buildFlow(callee.fns[0], fakeState([callee]));
  assertDeepEqual(flow.callerArgs, []);
  assertDeepEqual(flow.callerBindings, []);
});

test('flow: js multi-line caller call captured', () => {
  const callee = parseFile('a.js', `function parse(data, opts) { return data; }\n`, 'a.js');
  const caller = parseFile('b.js',
    `function main(){\n  const ast = parse(\n    raw,\n    { strict: true }\n  );\n}\n`, 'b.js');
  const flow = buildFlow(callee.fns[0], fakeState([callee, caller]));
  assertEqual(flow.callerArgs.length, 1);
  assertEqual(flow.callerArgs[0].args.length, 2);
});
