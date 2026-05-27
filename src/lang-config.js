export const LANG_CONFIG = {
  js: {
    name: 'JavaScript', color: '#EF9F27', comment: '//', localStyle: 'path',
    fn: [
      /(?:function|async\s+function)\s+(\w+)/gm,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/gm,
      /(\w+)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>/gm,
    ],
    imports: [
      /import\s+(?:[^'"]+from\s+)?["']([^"']+)["']/gm,
      /require\(["']([^"']+)["']\)/gm,
    ],
    docBefore: /\/\*\*([\s\S]*?)\*\//g,
    locals: [
      /(?:^|;|\{|,)\s*(?:const|let|var)\s+(\w+)\s*=/gm,
      /(?:^|;|\{)\s*(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*=/gm,
      /(?:^|;|\{)\s*(?:const|let|var)\s*\[\s*([^\]]+)\s*\]\s*=/gm,
    ],
    builtins: new Set([
      'console', 'window', 'document', 'globalThis', 'process',
      'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt',
      'Math', 'JSON', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError',
      'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
      'Proxy', 'Reflect', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
      'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
      'Float32Array', 'Float64Array', 'ArrayBuffer', 'DataView',
      'parseInt', 'parseFloat', 'isNaN', 'isFinite',
      'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'fetch', 'alert', 'confirm', 'prompt',
      'undefined', 'NaN', 'Infinity',
    ]),
  },
  py: {
    name: 'Python', color: '#3B8BD4', comment: '#',
    fn: [/def\s+(\w+)/gm, /class\s+(\w+)/gm],
    imports: [
      /^\s*from\s+([\w.]+)\s+import\b/gm,
      /^\s*import\s+([\w.]+)/gm,
    ],
    docInside: /^\s*("""|''')([\s\S]*?)\1/,
    locals: [/^[ \t]+([A-Za-z_]\w*)\s*=(?!=)/gm],
    builtins: new Set([
      'print', 'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed',
      'dict', 'list', 'tuple', 'set', 'frozenset', 'str', 'int', 'float', 'bool', 'bytes', 'bytearray',
      'type', 'isinstance', 'issubclass', 'callable', 'id', 'hash', 'repr', 'ascii',
      'abs', 'min', 'max', 'sum', 'round', 'divmod', 'pow',
      'any', 'all', 'iter', 'next',
      'open', 'input', 'format', 'vars', 'dir', 'getattr', 'setattr', 'hasattr', 'delattr',
      'object', 'property', 'classmethod', 'staticmethod',
      'super', 'self', 'cls',
      'Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError',
      'AttributeError', 'RuntimeError', 'StopIteration', 'NotImplementedError',
      'True', 'False', 'None',
    ]),
  },
  go: {
    name: 'Go', color: '#5DCAA5', comment: '//', localStyle: 'path',
    fn: [/func\s+(?:\([^)]+\)\s+)?(\w+)/gm],
    imports: [/import\s+(?:[\w.]+\s+)?["']([^"']+)["']/gm],
    docBefore: /(?:^[ \t]*\/\/[^\n]*\n)+/m,
    locals: [/(?:^|;|\{)\s*(?:var\s+)?(\w+)\s*:?=(?!=)/gm],
    builtins: new Set([
      'len', 'cap', 'make', 'new', 'append', 'copy', 'delete',
      'close', 'panic', 'recover', 'print', 'println',
      'nil', 'true', 'false', 'iota',
      'string', 'bool', 'byte', 'rune', 'error',
      'int', 'int8', 'int16', 'int32', 'int64',
      'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr',
      'float32', 'float64', 'complex64', 'complex128',
    ]),
  },
  rs: {
    name: 'Rust', color: '#D85A30', comment: '//',
    fn: [/fn\s+(\w+)/gm, /struct\s+(\w+)/gm, /enum\s+(\w+)/gm],
    imports: [/use\s+(\w+)/gm],
    docBefore: /(?:^[ \t]*\/\/\/[^\n]*\n)+/m,
    locals: [/(?:^|;|\{)\s*let\s+(?:mut\s+)?(\w+)/gm],
    builtins: new Set([
      'println', 'print', 'eprintln', 'eprint', 'format', 'panic', 'assert', 'assert_eq', 'assert_ne',
      'vec', 'String', 'Vec', 'Option', 'Result', 'Box', 'Rc', 'Arc', 'Cell', 'RefCell',
      'Some', 'None', 'Ok', 'Err',
      'true', 'false',
      'i8', 'i16', 'i32', 'i64', 'i128', 'isize',
      'u8', 'u16', 'u32', 'u64', 'u128', 'usize',
      'f32', 'f64', 'bool', 'char', 'str',
    ]),
  },
  rb: {
    name: 'Ruby', color: '#E24B4A', comment: '#', localStyle: 'path',
    fn: [/def\s+(\w+)/gm, /class\s+(\w+)/gm, /module\s+(\w+)/gm],
    imports: [/require(?:_relative)?\s+["']([^"']+)["']/gm],
    docBefore: /(?:^[ \t]*#[^\n]*\n)+/m,
    locals: [/^[ \t]+([a-z_]\w*)\s*=(?!=)/gm],
    builtins: new Set([
      'puts', 'print', 'p', 'pp', 'gets',
      'attr_accessor', 'attr_reader', 'attr_writer',
      'require', 'require_relative', 'load',
      'raise', 'fail', 'throw', 'catch',
      'true', 'false', 'nil', 'self',
      'Integer', 'Float', 'String', 'Array', 'Hash', 'Symbol', 'Range',
    ]),
  },
  java: {
    name: 'Java', color: '#E85D24', comment: '//',
    fn: [/(?:public|private|protected|static|\s)+\s+[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)\s*(?:throws[^{]+)?\{/gm],
    imports: [/import\s+([\w.]+);/gm],
    docBefore: /\/\*\*([\s\S]*?)\*\//g,
    locals: [/^[ \t]+(?:final\s+)?[\w<>\[\]]+\s+(\w+)\s*=(?!=)/gm],
    builtins: new Set([
      'System', 'String', 'Integer', 'Long', 'Double', 'Float', 'Boolean', 'Character', 'Byte', 'Short',
      'Object', 'Math', 'Number', 'Class',
      'Exception', 'RuntimeException', 'Throwable', 'Error',
      'List', 'Map', 'Set', 'Collection', 'ArrayList', 'HashMap', 'HashSet', 'LinkedList',
      'Optional', 'Stream',
      'true', 'false', 'null', 'this', 'super',
    ]),
  },
};

LANG_CONFIG.jsx = { ...LANG_CONFIG.js, name: 'JSX' };
LANG_CONFIG.ts  = { ...LANG_CONFIG.js, name: 'TypeScript', color: '#185FA5' };
LANG_CONFIG.tsx = { ...LANG_CONFIG.js, name: 'TSX',        color: '#185FA5' };

LANG_CONFIG.html = {
  name: 'HTML', color: '#E04E2A', comment: '<!--', localStyle: 'path',
  fn: [],
  imports: [
    /<script[^>]+src=["']([^"']+)["']/gim,
    /<link[^>]+href=["']([^"']+)["']/gim,
  ],
};
LANG_CONFIG.htm = { ...LANG_CONFIG.html };

LANG_CONFIG.css = {
  name: 'CSS', color: '#1F7AC2', comment: '/*', localStyle: 'path',
  fn: [],
  imports: [
    /@import\s+(?:url\()?["']([^"')]+)["']\)?/gm,
  ],
};
LANG_CONFIG.scss = { ...LANG_CONFIG.css, name: 'SCSS', color: '#C26593' };
LANG_CONFIG.sass = { ...LANG_CONFIG.css, name: 'Sass', color: '#C26593' };
LANG_CONFIG.less = { ...LANG_CONFIG.css, name: 'Less', color: '#264C82' };

LANG_CONFIG.vue = { ...LANG_CONFIG.js, name: 'Vue',     color: '#41B883' };
LANG_CONFIG.svelte = { ...LANG_CONFIG.js, name: 'Svelte', color: '#FF3E00' };
