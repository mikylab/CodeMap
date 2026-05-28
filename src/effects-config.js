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
    js:   ['pg', 'pg-promise', 'mysql', 'mysql2', 'sqlite3', 'better-sqlite3',
           'mongodb', 'mongoose', 'redis', 'ioredis',
           'prisma', '@prisma/client', 'typeorm', 'knex', 'drizzle-orm', 'sequelize',
           '@supabase/supabase-js', 'firebase', 'firebase-admin', '@firebase/firestore',
           'cassandra-driver', 'mssql', 'tedious', 'oracledb', '@neondatabase/serverless',
           '@planetscale/database', 'kysely', 'dexie'],
    py:   ['psycopg2', 'psycopg', 'asyncpg', 'sqlalchemy', 'pymongo', 'motor',
           'redis', 'sqlite3', 'mysql', 'pymysql', 'aiomysql', 'aiosqlite',
           'cassandra', 'tortoise', 'peewee', 'mongoengine', 'supabase', 'firebase_admin'],
    go:   ['database/sql', 'gorm.io', 'go.mongodb.org'],
    rs:   ['sqlx', 'diesel', 'sea-orm', 'mongodb', 'redis'],
    rb:   ['pg', 'mysql2', 'redis', 'active_record', 'sequel', 'mongo'],
    java: ['java.sql', 'jakarta.persistence', 'javax.persistence', 'org.hibernate', 'org.springframework.data'],
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
//
// Each entry can be a bare RegExp (treated as direction 'both') or an object
// `{ re, dir }` where `dir` is 'read' | 'write' | 'both'. Direction feeds the
// Flow tab's input/output split; existing consumers ignore it.
export const EFFECT_PATTERNS = {
  dom: [
    { re: /\bdocument\.\w+/,                dir: 'both'  },
    { re: /\bwindow\.\w+/,                  dir: 'both'  },
    { re: /\bgetElementById\b/,             dir: 'read'  },
    { re: /\bquerySelector(?:All)?\b/,      dir: 'read'  },
    { re: /\binnerHTML\b/,                  dir: 'both'  },
    { re: /\bouterHTML\b/,                  dir: 'both'  },
  ],
  env: [
    { re: /\bprocess\.env\b/,               dir: 'read'  },
    { re: /\bos\.environ\b/,                dir: 'read'  },
    { re: /\bstd::env::/,                   dir: 'read'  },
    { re: /\bSystem\.getenv\b/,             dir: 'read'  },
  ],
  fs: [
    { re: /\bfs\.read\w*/,                  dir: 'read'  },
    { re: /\bfs\.write\w*/,                 dir: 'write' },
    { re: /\bfs\.\w+/,                      dir: 'both'  },
    { re: /\bopen\s*\(/,                    dir: 'both'  },
    { re: /\bPath\s*\(/,                    dir: 'both'  },
    { re: /\bos\.path\.\w+/,                dir: 'read'  },
  ],
  net: [
    { re: /\bfetch\s*\(/,                   dir: 'both'  },
    { re: /\baxios\.\w+/,                   dir: 'both'  },
    { re: /\.get\s*\(\s*['"]https?:/,       dir: 'read'  },
    { re: /\bXMLHttpRequest\b/,             dir: 'both'  },
  ],
  exec: [
    { re: /\bsubprocess\.\w+/,              dir: 'write' },
    { re: /\bchild_process\.\w+/,           dir: 'write' },
    { re: /\bos\.system\b/,                 dir: 'write' },
    { re: /\bspawn\s*\(/,                   dir: 'write' },
    { re: /\bexec\s*\(/,                    dir: 'write' },
  ],
  db: [
    // SQL strings — execute/query/raw with a leading SQL keyword
    /\b(?:query|execute|exec|raw|prepare)\s*\(\s*['"`](?:\s|--|\/\*)*(?:select|insert|update|delete|create|alter|drop|truncate|with|merge|begin|commit|rollback)\b/i,
    // Connection strings
    /['"`](?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|redis|rediss|cassandra|sqlserver|oracle):\/\//i,
    // MongoDB / Mongoose API
    /\.(?:collection|aggregate|insertOne|insertMany|findOne|findOneAnd\w+|deleteOne|deleteMany|updateOne|updateMany|replaceOne|countDocuments|estimatedDocumentCount|bulkWrite|createIndex)\s*\(/,
    // Prisma / Drizzle / Kysely / TypeORM
    /\.(?:findUnique|findFirst|findMany|upsert|createMany|updateMany|deleteMany)\s*\(/,
    // Knex / SQL builder chains
    /\b(?:knex|db|client|pool)\s*\(\s*['"`]\w+['"`]\s*\)\s*\.(?:select|insert|update|del|delete|where)\b/i,
    // Redis-style commands
    /\.(?:hset|hget|hgetall|sadd|smembers|zadd|zrange|lpush|rpush|expire|ttl)\s*\(/,
    // Supabase / Firestore typical chains
    /\.from\s*\(\s*['"`]\w+['"`]\s*\)\s*\.(?:select|insert|update|delete|upsert)\s*\(/,
    /\.collection\s*\(\s*['"`][^'"`]+['"`]\s*\)\s*\.(?:doc|where|orderBy|add|set|get)\s*\(/,
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
    // Builtin error constructors (thrown bare, no import needed)
    'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError',
    'URIError', 'AggregateError',
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
    // interpreter / system builtins
    'exit', 'quit', 'breakpoint', 'help', 'compile', 'eval', 'exec',
    '__import__', 'ascii', 'bin', 'hex', 'oct', 'ord', 'chr', 'complex',
    'memoryview', 'slice', 'aiter', 'anext',
    'append', 'extend', 'insert', 'remove', 'pop', 'clear', 'copy', 'update',
    'keys', 'values', 'items', 'get', 'setdefault', 'join', 'split', 'strip',
    'lower', 'upper', 'startswith', 'endswith', 'replace', 'find', 'index',
    'count', 'encode', 'decode',
    // Builtin exceptions (raised bare, no import needed)
    'Exception', 'BaseException', 'ValueError', 'TypeError', 'KeyError',
    'IndexError', 'AttributeError', 'RuntimeError', 'StopIteration',
    'StopAsyncIteration', 'NotImplementedError', 'FileNotFoundError',
    'FileExistsError', 'IsADirectoryError', 'NotADirectoryError',
    'PermissionError', 'OSError', 'IOError', 'EOFError', 'ImportError',
    'ModuleNotFoundError', 'LookupError', 'ArithmeticError', 'ZeroDivisionError',
    'OverflowError', 'FloatingPointError', 'AssertionError', 'NameError',
    'UnboundLocalError', 'RecursionError', 'MemoryError', 'SystemError',
    'SystemExit', 'KeyboardInterrupt', 'GeneratorExit', 'ConnectionError',
    'ConnectionRefusedError', 'ConnectionResetError', 'ConnectionAbortedError',
    'BrokenPipeError', 'TimeoutError', 'UnicodeError', 'UnicodeDecodeError',
    'UnicodeEncodeError', 'Warning', 'DeprecationWarning', 'UserWarning',
    'FutureWarning', 'ResourceWarning',
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
