// Effect taxonomy and per-language detection rules.
//
// EFFECT_TAGS    — canonical ordered tuple of effect tags. Order is also the
//                  preferred render order in badge strips.
// EFFECT_LIBS    — for each tag, the lib names that imply that effect, keyed
//                  by language family (js | py | go | rs | rb | java).
// EFFECT_PATTERNS — regex patterns over function-body slices that imply an
//                  effect even without a matching import (e.g. `document.*`,
//                  `process.env`).
// BUILTINS       — names that should never be flagged as unresolved calls in
//                  9b. Seeded from the most common stdlib / runtime names.
// EFFECT_COLORS  — display hex per tag (also referenced by views/graph.js
//                  paint-mode ring colors in 9c).

export const EFFECT_TAGS = ['net', 'fs', 'db', 'exec', 'dom', 'env'];

export const EFFECT_COLORS = {
  net:  '#4d8df0',
  fs:   '#e08a3c',
  db:   '#a874e0',
  exec: '#e0584d',
  dom:  '#4dbf7a',
  env:  '#e0c84d',
};

// Language family extracted from a file's `ext`. Mirrors lang-config.js
// aliases (jsx/ts/tsx/vue/svelte all collapse to js).
export function langFamily(ext) {
  if (!ext) return null;
  if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx' || ext === 'vue' || ext === 'svelte') return 'js';
  if (ext === 'py') return 'py';
  if (ext === 'go') return 'go';
  if (ext === 'rs') return 'rs';
  if (ext === 'rb') return 'rb';
  if (ext === 'java') return 'java';
  return null;
}

export const EFFECT_LIBS = {
  net: {
    js:   ['fetch', 'axios', 'node-fetch', 'http', 'https', 'undici', 'got', 'ky', 'superagent'],
    py:   ['requests', 'urllib', 'urllib3', 'httpx', 'aiohttp'],
    go:   ['net/http'],
    rs:   ['reqwest', 'hyper'],
    rb:   ['net/http', 'httparty', 'faraday'],
    java: ['java.net'],
  },
  fs: {
    js:   ['fs', 'fs/promises', 'path', 'graceful-fs'],
    py:   ['pathlib', 'os.path', 'shutil', 'io'],
    go:   ['os', 'io/ioutil', 'io'],
    rs:   ['std::fs'],
    rb:   ['File', 'FileUtils', 'pathname'],
    java: ['java.io', 'java.nio'],
  },
  db: {
    js:   ['pg', 'mysql', 'mysql2', 'sqlite3', 'better-sqlite3', 'mongodb', 'mongoose', 'redis', 'ioredis', 'prisma', 'typeorm', 'knex', 'drizzle-orm', 'sequelize'],
    py:   ['psycopg2', 'sqlalchemy', 'pymongo', 'redis', 'sqlite3', 'mysql'],
    go:   ['database/sql', 'gorm.io'],
    rs:   ['sqlx', 'diesel'],
    rb:   ['pg', 'mysql2', 'redis', 'active_record', 'sequel'],
    java: ['java.sql', 'jakarta.persistence', 'javax.persistence'],
  },
  exec: {
    js:   ['child_process', 'execa'],
    py:   ['subprocess', 'os'],
    go:   ['os/exec'],
    rs:   ['std::process'],
    rb:   ['Open3'],
    java: ['java.lang.Runtime', 'java.lang.ProcessBuilder'],
  },
  dom: {
    js: ['react-dom', 'jquery'],
  },
  env: {
    js: ['dotenv'],
    py: ['dotenv', 'python-dotenv'],
  },
};

// Patterns that fire on raw fn body slices (after string/comment stripping).
// Keep these intentionally narrow — false positives here propagate up the
// call graph as inherited tags and are visually expensive to undo.
export const EFFECT_PATTERNS = {
  dom: [
    /\bdocument\.\w+/,
    /\bwindow\.\w+/,
    /\bgetElementById\b/,
    /\bquerySelector(?:All)?\b/,
    /\binnerHTML\b/,
    /\bouterHTML\b/,
  ],
  env: [
    /\bprocess\.env\b/,
    /\bos\.environ\b/,
    /\bstd::env::/,
    /\bSystem\.getenv\b/,
  ],
  fs: [
    /\bfs\.\w+/,
    /\bopen\s*\(/,
    /\bPath\s*\(/,
    /\bos\.path\.\w+/,
  ],
  net: [
    /\bfetch\s*\(/,
    /\baxios\.\w+/,
    /\.get\s*\(\s*['"]https?:/,
    /\bXMLHttpRequest\b/,
  ],
  exec: [
    /\bsubprocess\.\w+/,
    /\bchild_process\.\w+/,
    /\bos\.system\b/,
    /\bspawn\s*\(/,
    /\bexec\s*\(/,
  ],
  db: [
    /\.query\s*\(\s*['"`](?:select|insert|update|delete|create)\b/i,
  ],
};

// Builtin / global names per language family that the unresolved-call
// detector in 9b must NOT flag. Seeded with the highest-frequency names;
// tunable as real-world use exposes false positives.
export const BUILTINS = {
  js: new Set([
    // language globals
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'String', 'Number', 'Boolean',
    'Array', 'Object', 'Date', 'RegExp', 'Error', 'Promise', 'Symbol', 'Map', 'Set',
    'WeakMap', 'WeakSet', 'JSON', 'Math', 'console', 'setTimeout', 'setInterval',
    'clearTimeout', 'clearInterval', 'queueMicrotask', 'structuredClone',
    'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
    'fetch', 'alert', 'confirm', 'prompt',
    // Array/Object common methods (often called bare via destructuring / chains)
    'map', 'filter', 'reduce', 'forEach', 'find', 'findIndex', 'some', 'every',
    'includes', 'indexOf', 'slice', 'splice', 'concat', 'join', 'split', 'sort',
    'reverse', 'push', 'pop', 'shift', 'unshift', 'flat', 'flatMap', 'entries',
    'keys', 'values', 'assign', 'freeze', 'create', 'fromEntries',
    // Promise / async
    'then', 'catch', 'finally', 'all', 'race', 'resolve', 'reject',
    // String
    'toString', 'toLowerCase', 'toUpperCase', 'trim', 'replace', 'replaceAll',
    'startsWith', 'endsWith', 'padStart', 'padEnd', 'repeat', 'charAt', 'charCodeAt',
    // Number
    'toFixed', 'toPrecision',
  ]),
  py: new Set([
    'print', 'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'reduce',
    'sorted', 'reversed', 'sum', 'min', 'max', 'abs', 'round', 'pow', 'divmod',
    'int', 'float', 'str', 'bool', 'list', 'dict', 'set', 'tuple', 'frozenset',
    'bytes', 'bytearray', 'type', 'isinstance', 'issubclass', 'hasattr', 'getattr',
    'setattr', 'delattr', 'callable', 'iter', 'next', 'open', 'input', 'repr',
    'hash', 'id', 'vars', 'dir', 'globals', 'locals', 'super', 'object',
    'staticmethod', 'classmethod', 'property', 'format', 'any', 'all',
    'append', 'extend', 'insert', 'remove', 'pop', 'clear', 'copy', 'update',
    'keys', 'values', 'items', 'get', 'setdefault', 'join', 'split', 'strip',
    'lower', 'upper', 'startswith', 'endswith', 'replace', 'find', 'index',
    'count', 'encode', 'decode',
  ]),
  go: new Set([
    'len', 'cap', 'make', 'new', 'append', 'copy', 'delete', 'panic', 'recover',
    'print', 'println', 'close', 'complex', 'real', 'imag', 'string',
  ]),
  rs: new Set([
    'println', 'print', 'eprintln', 'eprint', 'format', 'write', 'writeln',
    'vec', 'String', 'Vec', 'Box', 'Rc', 'Arc', 'Some', 'None', 'Ok', 'Err',
    'Default', 'Clone', 'Copy', 'unwrap', 'expect', 'as_ref', 'as_str',
    'to_string', 'to_owned', 'into', 'from', 'len', 'is_empty', 'iter',
    'collect', 'map', 'filter', 'fold',
  ]),
  rb: new Set([
    'puts', 'print', 'p', 'pp', 'gets', 'require', 'require_relative', 'load',
    'attr_accessor', 'attr_reader', 'attr_writer', 'lambda', 'proc', 'raise',
    'rescue', 'yield', 'block_given', 'send', 'respond_to', 'kind_of', 'is_a',
    'instance_of', 'each', 'map', 'select', 'reject', 'reduce', 'inject',
    'find', 'sort', 'sort_by', 'group_by', 'count', 'size', 'length', 'first',
    'last', 'push', 'pop', 'shift', 'unshift', 'include', 'extend',
  ]),
  java: new Set([
    'System', 'String', 'Integer', 'Long', 'Double', 'Float', 'Boolean',
    'Math', 'Object', 'Class', 'Exception', 'RuntimeException', 'Thread',
    'Override', 'Deprecated', 'SuppressWarnings',
  ]),
};
