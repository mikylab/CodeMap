// Pure per-token resolution. Given a token observed in a file at a line,
// return what kind of thing the name refers to and where (if anywhere) it is
// defined. No DOM, no STATE mutation. Tested by tests/resolver.test.js.

import { LANG_CONFIG } from './lang-config.js';

const KEYWORDS = new Set('if for while switch return class import export const let var def function async await new try catch finally else do break continue in of typeof instanceof sizeof match throw yield super self this lambda fn struct enum impl mod use defer go synchronized assert raise pass and or not is del global nonlocal with as from except elif true false null nil None True False'.split(' '));

// resolve(token, file, lineNum, enclosingFn, state)
//   token        — string identifier observed
//   file         — { path, ext } of the file being read
//   lineNum      — 1-indexed line where the token appears
//   enclosingFn  — ParsedFn whose body contains lineNum, or null
//   state        — { byPath, resolveIndex } (resolveIndex Map<name, Entry[]>)
// returns:
//   null  — token is a keyword, skip entirely (no tooltip, no wrap)
//   { kind, ... } — see kinds below
export function resolve(token, file, lineNum, enclosingFn, state) {
  if (!token || KEYWORDS.has(token)) return null;
  if (token.length < 2) return null;

  // Steps 2-6 added in later tasks.

  const cfg = LANG_CONFIG[file.ext];
  if (cfg?.builtins?.has(token)) {
    return { kind: 'builtin', language: cfg.name };
  }

  return { kind: 'unresolved' };
}
