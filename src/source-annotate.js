// Build a per-line annotation map for the Source view: every call site whose
// target resolves to an in-repo function becomes a clickable link, every
// import line whose lib resolves to a repo file becomes a link too.
// Pure regex, no AST. Designed to be called lazily and cached per file.

const KEYWORDS = new Set('if for while switch return class import export const let var def function async await new try catch finally else do break continue in of typeof instanceof sizeof match throw yield super self this print puts println printf lambda fn struct enum impl mod use defer go synchronized assert raise pass'.split(' '));
const CALL_RE = /\b([A-Za-z_]\w*)\s*\(/g;

export function annotateFile(file, state) {
  const byLine = new Map();
  if (!file || !file.src) return { byLine };

  const lines = file.src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const annots = [];
    CALL_RE.lastIndex = 0;
    let m;
    while ((m = CALL_RE.exec(line)) !== null) {
      const name = m[1];
      if (name.length < 2 || KEYWORDS.has(name)) continue;
      const target = resolveCall(name, file, state);
      annots.push({
        col: m.index,
        len: name.length,
        kind: 'call',
        label: name,
        target: target ? target.key : null,
        conf: target ? target.conf : 'unresolved',
      });
    }
    addImportAnnots(file, line, state, annots);

    if (annots.length) {
      annots.sort((a, b) => a.col - b.col);
      const filtered = [];
      let lastEnd = -1;
      for (const a of annots) {
        if (a.col >= lastEnd) {
          filtered.push(a);
          lastEnd = a.col + a.len;
        }
      }
      byLine.set(i + 1, filtered);
    }
  }
  return { byLine };
}

function resolveCall(name, file, state) {
  const byName = state.fnByName?.get?.(name);
  if (!byName) return null;
  return {
    key: `${byName.file}::${byName.name}`,
    conf: byName.file === file.path ? 'high' : 'med',
  };
}

function addImportAnnots(file, line, state, annots) {
  if (!file.imports?.length) return;
  for (const im of file.imports) {
    const lib = im.lib;
    if (!lib) continue;
    const idx = line.indexOf(lib);
    if (idx < 0) continue;
    const target = resolveImportToFile(lib, state);
    if (!target) continue;
    annots.push({
      col: idx, len: lib.length,
      kind: 'import', label: lib,
      target, conf: 'high',
    });
  }
}

function resolveImportToFile(lib, state) {
  for (const f of state.files || []) {
    const stem = f.path.replace(/\.[^.]+$/, '');
    if (stem === lib || stem.endsWith('/' + lib)) return f.path;
  }
  return null;
}
