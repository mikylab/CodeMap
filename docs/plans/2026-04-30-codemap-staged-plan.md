# Codemap Staged Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Codemap — a zero-dependency, browser-native code intelligence tool that parses local repos via drag-and-drop and renders metrics, a guided walkthrough, and a dependency graph — entirely client-side, deterministically, with no LLM or server.

**Architecture:** Vanilla JS + ES modules, single `index.html` entry, no build step. Pure-function parsing/analysis layers feed an idempotent renderer and a canvas graph. State lives in one `STATE` object. All language support is regex-driven via `lang-config.js`.

**Tech Stack:** HTML5 / CSS variables / vanilla ES modules / File System Access API + drag-and-drop / Canvas 2D. Tests run in the browser via `tests.html` + a tiny in-repo runner (`tests/runner.js`) — **no Node, no npm, no installs**. Open `tests.html` in any Chromium browser; results render to the page.

---

## Phases at a glance

| Phase | Deliverable | Demo-able outcome |
|---|---|---|
| 1 | Parser + minimal UI shell | Drop a folder, see a flat list of files with language + line + fn counts |
| 2 | Analyzer + provisional sidebar/detail UI | Sidebar grouped by language, file detail with functions, complexity, imports (interim layout — superseded by Phase 4) |
| 3 | Walker (data layer) | `generateWalk(state)` produces deterministic step array; provisional 3-column UI exists but is replaced in Phase 4 |
| 4 | **Design-system migration to tabbed shell** (per `docs/plans/design.md`) | Toolbar + 200px sidebar + stat bar + tab-switched main panel. Tabs implemented: Overview, Walk, Functions, Libraries |
| 5 | Trace tab | Per-function call tree (same-file co-location heuristic) with detail pane |
| 6 | Graph tab | Canvas circular graph, node = file, edge = shared import/language |
| 7 | Polish, perf, docs | Hits perf targets, escaping audit, README, accessible keyboard nav |

> **Authoritative UI spec:** `docs/plans/design.md`. Phase 4 onward must follow it exactly — IBM Plex Mono / Sans only, 0.5px borders, no gradients/shadows, defined color tokens, defined spacing scale. Phases 2 and 3 produced data layers (analyzer, walker) that remain correct; only their *rendering* is replaced in Phase 4.

Each phase ends with: tests green, manual smoke test on a real repo, commit.

---

## File structure (final state)

```
codemap/
├── index.html                # entry — loads modules, holds layout shell
├── styles.css                # CSS variables + layout (single sheet)
├── src/
│   ├── lang-config.js        # LANG_CONFIG export
│   ├── parser.js             # parseFile(name, src, path) -> ParsedFile|null
│   ├── analyzer.js           # analyze(parsedFiles) -> AnalyzedState
│   ├── walker.js             # generateWalk(state) -> WalkStep[]
│   ├── renderer.js           # render*(state) — idempotent DOM ops
│   ├── graph.js              # renderGraph(canvas, state)
│   ├── state.js              # STATE singleton + mutators
│   └── ingest.js             # FS API + drag/drop -> raw {path, src}[]
├── tests.html               # browser test runner page
├── tests/
│   ├── runner.js            # tiny test()/assert helpers + report()
│   ├── parser.test.js
│   ├── analyzer.test.js
│   └── walker.test.js
├── fixtures/
│   └── <small repos per language>
├── docs/plans/...
├── CLAUDE.md
└── README.md
```

---

# PHASE 1 — Parser + minimal UI shell

**Goal of phase:** A user can open `index.html`, drop a folder, and see a flat table of every detected source file with `path | language | lineCount | fnCount | importCount`. No analysis, no walk, no graph. Parser is fully tested for every language in `LANG_CONFIG`.

**Files this phase creates:**
- `index.html`
- `styles.css`
- `src/lang-config.js`
- `src/parser.js`
- `src/ingest.js`
- `src/state.js`
- `src/renderer.js` (skeleton — only `renderFileList`)
- `tests/runner.js`
- `tests/parser.test.js`
- `tests.html`
- `fixtures/` per language

> **No `package.json`. No `node_modules`. No devDeps.** Tests live in the browser, same as the app.

### Task 1.1: Project skeleton + browser test harness

We ship a ~40-line in-repo runner (`tests/runner.js`) that exposes `test()`, `assertEqual()`, `assertDeepEqual()`, and `report()`. A `tests.html` page imports each `*.test.js` (which register cases via `test()`), then calls `report()` to render pass/fail to the DOM and `console`.

**Files:**
- Create: `.gitignore`
- Create: `tests/runner.js`
- Create: `tests/parser.test.js` (placeholder sentinel)
- Create: `tests.html`
- Create: `README.md` (one-liner; full README lands in Phase 5)

- [ ] **Step 1: Write `.gitignore`**

```
.DS_Store
*.log
```

- [ ] **Step 2: Write `tests/runner.js`**

```js
const cases = [];
export function test(name, fn) { cases.push({ name, fn }); }

export function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
export function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg || `deep mismatch:\n  expected ${b}\n  got      ${a}`);
}
export function assertNull(v, msg)  { if (v !== null) throw new Error(msg || `expected null, got ${JSON.stringify(v)}`); }
export function assertTrue(v, msg)  { if (v !== true) throw new Error(msg || `expected true, got ${JSON.stringify(v)}`); }
export function assertFalse(v, msg) { if (v !== false) throw new Error(msg || `expected false, got ${JSON.stringify(v)}`); }

export async function report(rootId = 'results') {
  const root = document.getElementById(rootId);
  let pass = 0, fail = 0;
  for (const c of cases) {
    const line = document.createElement('div');
    try {
      await c.fn();
      line.textContent = `✓ ${c.name}`;
      line.style.color = '#3fb950';
      pass++;
    } catch (e) {
      line.textContent = `✗ ${c.name} — ${e.message}`;
      line.style.color = '#f85149';
      fail++;
      console.error(c.name, e);
    }
    root.appendChild(line);
  }
  const summary = document.createElement('div');
  summary.style.marginTop = '12px';
  summary.style.fontWeight = 'bold';
  summary.textContent = `${pass}/${cases.length} passed${fail ? ` (${fail} failed)` : ''}`;
  root.appendChild(summary);
  console.log(`${pass}/${cases.length} passed`);
}
```

- [ ] **Step 3: Add a sentinel test that proves the harness runs**

`tests/parser.test.js`:
```js
import { test, assertEqual } from './runner.js';

test('harness runs', () => {
  assertEqual(1, 1);
});
```

- [ ] **Step 4: Write `tests.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Codemap tests</title>
<style>
  body { font: 13px/1.5 ui-monospace, monospace; background:#0d1117; color:#e6edf3; padding:16px; }
  h1 { font-size: 16px; margin: 0 0 12px; }
</style>
</head>
<body>
  <h1>Codemap tests</h1>
  <div id="results"></div>
  <script type="module">
    // Import every *.test.js file so its test() calls register.
    await import('./tests/parser.test.js');
    // (later phases append: analyzer.test.js, walker.test.js, graph.test.js)
    const { report } = await import('./tests/runner.js');
    await report();
  </script>
</body>
</html>
```

- [ ] **Step 5: Run**

Open `tests.html` in a Chromium browser (double-click, or `file://` URL). Expected: one green `✓ harness runs` line and `1/1 passed`.

> If your browser blocks ES module imports from `file://`, run a one-shot static server from the repo root using whatever you already have (e.g. `python -m http.server` is stdlib-only and ships with every Python install — no pip install required). Browser-only users can use any static-file extension. **No project dependency is added either way.**

- [ ] **Step 6: Stub README**

`README.md`:
```markdown
# Codemap

Browser-native, zero-dependency code intelligence. Open `index.html`, drop a folder.

Run tests: open `tests.html` in a browser.
```

- [ ] **Step 7: Commit**

```bash
git init && git add -A
git commit -m "chore: bootstrap project with browser test harness"
```

### Task 1.2: `lang-config.js` with seed languages

Languages for phase 1: **JavaScript/TypeScript, Python, Go, Rust, Ruby, Java**. (More can be added later — adding one is one-file change.)

**Files:**
- Create: `src/lang-config.js`

- [ ] **Step 1: Write the module**

```js
export const LANG_CONFIG = {
  js: {
    name: 'JavaScript', color: '#F7DF1E', comment: '//',
    fn: [
      /(?:function|async\s+function)\s+(\w+)/gm,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/gm,
      /(\w+)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>/gm,
    ],
    imports: [
      /import\s+(?:[^'"]+from\s+)?["']([^"']+)["']/gm,
      /require\(["']([^"']+)["']\)/gm,
    ],
  },
  jsx: { /* same as js */ },
  ts:  { /* same as js */ },
  tsx: { /* same as js */ },
  py: {
    name: 'Python', color: '#3572A5', comment: '#',
    fn: [/def\s+(\w+)/gm, /class\s+(\w+)/gm],
    imports: [/^\s*(?:from\s+([\w.]+)\s+)?import\s+([\w.,\s]+)/gm],
  },
  go: {
    name: 'Go', color: '#00ADD8', comment: '//',
    fn: [/func\s+(?:\([^)]+\)\s+)?(\w+)/gm],
    imports: [/import\s+(?:[\w.]+\s+)?["']([^"']+)["']/gm],
  },
  rs: {
    name: 'Rust', color: '#DEA584', comment: '//',
    fn: [/fn\s+(\w+)/gm, /struct\s+(\w+)/gm, /enum\s+(\w+)/gm],
    imports: [/use\s+([\w:]+)/gm],
  },
  rb: {
    name: 'Ruby', color: '#E24B4A', comment: '#',
    fn: [/def\s+(\w+)/gm, /class\s+(\w+)/gm, /module\s+(\w+)/gm],
    imports: [/require(?:_relative)?\s+["']([^"']+)["']/gm],
  },
  java: {
    name: 'Java', color: '#B07219', comment: '//',
    fn: [/(?:public|private|protected|static|\s)+\s+[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)\s*(?:throws[^{]+)?\{/gm],
    imports: [/import\s+([\w.]+);/gm],
  },
};

// jsx/ts/tsx mirror js — fix up after declaration to keep the literal small:
LANG_CONFIG.jsx = { ...LANG_CONFIG.js, name: 'JSX' };
LANG_CONFIG.ts  = { ...LANG_CONFIG.js, name: 'TypeScript', color: '#3178C6' };
LANG_CONFIG.tsx = { ...LANG_CONFIG.js, name: 'TSX',        color: '#3178C6' };
```

- [ ] **Step 2: Commit**

```bash
git add src/lang-config.js
git commit -m "feat(lang-config): seed JS/TS/Py/Go/Rust/Ruby/Java"
```

### Task 1.3: `parser.js` — TDD per language

Reserved keywords filter (used by parser):
```js
const KEYWORDS = new Set('if for while switch return class import export const let var def function async await new try catch finally else do break continue in of'.split(' '));
```

Cyclomatic-style complexity (file-level):
```js
function fileComplexityScore(src) {
  const count = re => (src.match(re) || []).length;
  const score = 1
    + count(/\bif\b/g) + count(/\belse\b/g) + count(/\bfor\b/g)
    + count(/\bwhile\b/g) + count(/\bcase\b/g) + count(/\bcatch\b/g)
    + count(/&&/g) + count(/\|\|/g) + count(/\?/g) + count(/\bswitch\b/g);
  return score;
}
```

**Files:**
- Create: `src/parser.js`
- Modify: `tests/parser.test.js`

- [ ] **Step 1: Write a failing test for Python function extraction**

Replace the sentinel test in `tests/parser.test.js` with:
```js
import { test, assertEqual, assertDeepEqual } from './runner.js';
import { parseFile } from '../src/parser.js';

test('python: extracts def names, ignores keywords', () => {
  const src = `def foo():\n    if True:\n        return 1\ndef bar(x): return x\n`;
  const out = parseFile('mod.py', src, 'pkg/mod.py');
  assertEqual(out.lang, 'Python');
  assertDeepEqual(out.fns.map(f => f.name).sort(), ['bar', 'foo']);
  assertEqual(out.fns.find(f => f.name === 'if'), undefined);
});
```

- [ ] **Step 2: Reload `tests.html` — expect FAIL** (red `✗` line; module-not-found surfaces in DevTools console)

- [ ] **Step 3: Implement minimal `parseFile`**

```js
import { LANG_CONFIG } from './lang-config.js';

const KEYWORDS = new Set('if for while switch return class import export const let var def function async await new try catch finally else do break continue in of'.split(' '));
const SKIP_DIRS = new Set('node_modules .git dist build .next __pycache__ .venv venv env coverage .cache'.split(' '));
const SKIP_EXTS = new Set('png jpg jpeg gif svg ico woff woff2 ttf eot lock map zip tar gz'.split(' '));

export function shouldSkipPath(path) {
  const parts = path.split(/[\\/]/);
  if (parts.some(p => SKIP_DIRS.has(p))) return true;
  const ext = (parts.at(-1).split('.').pop() || '').toLowerCase();
  if (SKIP_EXTS.has(ext)) return true;
  if (parts.at(-1).endsWith('.min.js') || parts.at(-1).endsWith('.min.css')) return true;
  return false;
}

export function parseFile(name, src, path) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const cfg = LANG_CONFIG[ext];
  if (!cfg) return null;

  const lineCount = src.split('\n').length;
  const fns = extractFns(src, cfg, path);
  const imports = extractImports(src, cfg, path);
  const fileScore = fileComplexityScore(src);
  const cx = clamp(fileScore / Math.max(fns.length, 1), 1, 30);

  return {
    name, path, ext,
    lang: cfg.name, langColor: cfg.color,
    lineCount, fns, imports, cx,
  };
}

function extractFns(src, cfg, path) {
  const out = []; const seen = new Set();
  for (const re of cfg.fn) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const name = m[1] || m[2] || m[3];
      if (!name || name.length < 2) continue;
      if (KEYWORDS.has(name)) continue;
      const key = name + '@' + m.index;
      if (seen.has(key)) continue;
      seen.add(key);
      const lineNum = src.slice(0, m.index).split('\n').length;
      out.push({ name, file: path, lineNum, lines: estBodyLines(src, m.index), cx: 1 });
    }
  }
  return out;
}

function estBodyLines(src, idx) {
  // crude: count lines until next blank line or 60 cap
  const after = src.slice(idx).split('\n');
  let n = 0;
  for (let i = 1; i < after.length && i < 60; i++) {
    if (after[i].trim() === '' && n > 0) break;
    n++;
  }
  return n;
}

function extractImports(src, cfg, path) {
  const out = []; const seen = new Set();
  for (const re of cfg.imports) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const raw = (m[1] || m[2] || '').trim();
      if (!raw) continue;
      if (raw.startsWith('.') || raw.startsWith('/')) continue;
      const lib = raw.split(/[/.]/)[0];
      if (!lib || seen.has(lib)) continue;
      seen.add(lib);
      out.push({ from: path, lib });
    }
  }
  return out;
}

function fileComplexityScore(src) {
  const count = re => (src.match(re) || []).length;
  return 1
    + count(/\bif\b/g) + count(/\belse\b/g) + count(/\bfor\b/g)
    + count(/\bwhile\b/g) + count(/\bcase\b/g) + count(/\bcatch\b/g)
    + count(/&&/g) + count(/\|\|/g) + count(/\?/g) + count(/\bswitch\b/g);
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
```

- [ ] **Step 4: Reload `tests.html` — expect PASS** (green `✓ python: extracts def names, ignores keywords`)

- [ ] **Step 5: Add tests for each remaining language**

For each of `js, ts, go, rs, rb, java`, add: (a) function-extraction test, (b) import-extraction test, (c) keyword false-positive test (e.g. `if (x) {}` must not produce a function named `if`).

- [ ] **Step 6: Add unsupported-extension test**

```js
import { assertNull } from './runner.js';

test('returns null for unsupported extension', () => {
  assertNull(parseFile('a.xyz', 'whatever', 'a.xyz'));
});
```

- [ ] **Step 7: Add `shouldSkipPath` tests**

```js
import { shouldSkipPath } from '../src/parser.js';
import { assertTrue, assertFalse } from './runner.js';

test('skips node_modules and binary extensions', () => {
  assertTrue(shouldSkipPath('node_modules/x/index.js'));
  assertTrue(shouldSkipPath('img/logo.png'));
  assertFalse(shouldSkipPath('src/app.js'));
});
```

- [ ] **Step 8: Reload `tests.html`**

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/parser.js tests/parser.test.js
git commit -m "feat(parser): parseFile across 7 seed languages with tests"
```

### Task 1.4: `state.js` — STATE singleton

**Files:**
- Create: `src/state.js`

- [ ] **Step 1: Write**

```js
export const STATE = {
  files: [],          // ParsedFile[]
  selectedPath: null, // string|null
  walk: [],           // WalkStep[] (Phase 3)
  walkIdx: 0,
};

export function setFiles(files) { STATE.files = files; STATE.selectedPath = null; }
export function selectPath(p)   { STATE.selectedPath = p; }
```

- [ ] **Step 2: Commit**

```bash
git add src/state.js && git commit -m "feat(state): STATE singleton + mutators"
```

### Task 1.5: `ingest.js` — drag/drop + File System Access

**Files:**
- Create: `src/ingest.js`

- [ ] **Step 1: Write**

```js
import { shouldSkipPath, parseFile } from './parser.js';

const MAX_BYTES = 2_000_000;

export async function ingestFromDrop(dataTransfer) {
  const items = [...dataTransfer.items];
  const out = [];
  for (const it of items) {
    const entry = it.webkitGetAsEntry?.();
    if (entry) await walkEntry(entry, '', out);
    else if (it.kind === 'file') await readFileItem(it.getAsFile(), '', out);
  }
  return out;
}

async function walkEntry(entry, prefix, out) {
  if (entry.isFile) {
    await new Promise(res => entry.file(async f => { await readFileItem(f, prefix, out); res(); }));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await new Promise(res => reader.readEntries(res));
    for (const e of entries) await walkEntry(e, prefix + entry.name + '/', out);
  }
}

async function readFileItem(file, prefix, out) {
  const path = prefix + file.name;
  if (shouldSkipPath(path)) return;
  if (file.size > MAX_BYTES) return;
  const src = await file.text();
  const parsed = parseFile(file.name, src, path);
  if (parsed) out.push(parsed);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ingest.js && git commit -m "feat(ingest): drag-drop folder ingestion"
```

### Task 1.6: `index.html` + `styles.css` + `renderer.js` skeleton

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/renderer.js`

- [ ] **Step 1: `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Codemap</title>
<link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header><h1>Codemap</h1><span id="status">Drop a folder to begin</span></header>
  <main>
    <section id="dropzone">Drop folder here</section>
    <section id="file-list"></section>
  </main>
  <script type="module">
    import { ingestFromDrop } from './src/ingest.js';
    import { setFiles } from './src/state.js';
    import { renderFileList } from './src/renderer.js';

    const dz = document.getElementById('dropzone');
    const status = document.getElementById('status');
    ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('hot'); }));
    ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('hot'); }));
    dz.addEventListener('drop', async e => {
      status.textContent = 'Parsing…';
      const t0 = performance.now();
      const files = await ingestFromDrop(e.dataTransfer);
      setFiles(files);
      renderFileList();
      status.textContent = `${files.length} files in ${(performance.now()-t0).toFixed(0)}ms`;
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: `styles.css` (minimal)**

```css
:root { --bg:#0d1117; --fg:#e6edf3; --muted:#7d8590; --accent:#58a6ff; --line:#30363d; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.4 ui-monospace, monospace; }
header { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid var(--line); }
main { padding:16px; }
#dropzone { border:2px dashed var(--line); padding:32px; text-align:center; color:var(--muted); border-radius:8px; }
#dropzone.hot { border-color: var(--accent); color: var(--accent); }
#file-list { margin-top:16px; }
.file-row { display:grid; grid-template-columns:1fr 100px 80px 80px 80px; padding:6px 8px; border-bottom:1px solid var(--line); }
.lang-badge { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; vertical-align:middle; }
```

- [ ] **Step 3: `src/renderer.js` skeleton**

```js
import { STATE } from './state.js';

export function renderFileList() {
  const root = document.getElementById('file-list');
  root.replaceChildren();
  const header = row(['path', 'lang', 'lines', 'fns', 'imports'], true);
  root.appendChild(header);
  for (const f of [...STATE.files].sort((a, b) => a.path.localeCompare(b.path))) {
    root.appendChild(fileRow(f));
  }
}

function fileRow(f) {
  const r = document.createElement('div');
  r.className = 'file-row';
  r.append(
    cell(langDot(f.langColor) + escape(f.path)),
    cell(escape(f.lang)),
    cell(String(f.lineCount)),
    cell(String(f.fns.length)),
    cell(String(f.imports.length)),
  );
  return r;
}

function row(cells, header=false) {
  const r = document.createElement('div'); r.className = 'file-row';
  cells.forEach(c => r.appendChild(cell(escape(c), header)));
  return r;
}
function cell(html, header=false) {
  const d = document.createElement('div');
  d.innerHTML = html;
  if (header) d.style.color = 'var(--muted)';
  return d;
}
function langDot(color) { return `<span class="lang-badge" style="background:${escape(color)}"></span>`; }
function escape(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
```

- [ ] **Step 4: Manual smoke test**

Open `index.html` in a Chromium browser. Drag in a small repo (e.g. one of the fixtures). Verify the file list appears and counts look reasonable.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css src/renderer.js
git commit -m "feat: phase-1 UI shell with file list rendering"
```

### Phase 1 exit criteria
- [ ] All `parser.test.js` tests pass.
- [ ] Dropping a real ~50-file repo populates the table in <500ms.
- [ ] Re-dropping a different folder replaces the list (idempotent render).
- [ ] No external runtime dependencies in `index.html`.

---

# PHASE 2 — Analyzer + sidebar/detail UI

**Goal of phase:** Sidebar groups files by language with counts; clicking a file opens a detail panel showing its functions (name, line, complexity), per-file complexity, imports, and inferred dependents.

**New files:**
- `src/analyzer.js`
- `tests/analyzer.test.js`

**Modified:**
- `src/renderer.js` (add `renderSidebar`, `renderDetail`)
- `src/state.js` (add analyzed fields)
- `index.html` (3-pane layout)
- `styles.css`

### Tasks (summary — expand at execution time)

- [ ] **2.1** Define `AnalyzedState` shape and `analyze(parsedFiles)` signature in `analyzer.js` with a no-op implementation; commit.
- [ ] **2.2** TDD: import normalization edges. Test that two files importing `react` produce an edge between them; that relative imports do not produce edges; that `torch.nn.functional` collapses to `torch`.
- [ ] **2.3** TDD: per-function complexity. Walk each fn body window (line range = `lineNum` to `lineNum + lines`) and count decision points; clamp `[1, 30]`.
- [ ] **2.4** TDD: connectivity score per file = `inDegree + outDegree` from import edges.
- [ ] **2.5** Wire `analyze()` into the drop handler; store result on `STATE`.
- [ ] **2.6** Implement `renderSidebar`: groups by `lang.name`, shows count, click selects file. Idempotent.
- [ ] **2.7** Implement `renderDetail(path)`: header w/ language + line + cx, list of functions sorted by `cx desc`, list of imports, list of dependents (files importing same libs).
- [ ] **2.8** Update layout in `index.html` + `styles.css` to 3-pane (dropzone collapses to header button after first ingest).
- [ ] **2.9** Manual smoke test on a real repo; verify perf target (sidebar render <50ms for 500 files).

### Phase 2 exit criteria
- [ ] `analyzer.test.js` covers normalization, per-fn cx, connectivity.
- [ ] Selecting any file renders detail panel with no console errors.
- [ ] Re-selecting renders deterministically (idempotent).

---

# PHASE 3 — Walker + guided walk panel

**Goal of phase:** A right-hand panel shows step-by-step walkthrough generated deterministically from analyzed state. Prev/Next buttons + keyboard arrows. Clicking a step's referenced file opens it in the detail panel.

**New files:**
- `src/walker.js`
- `tests/walker.test.js`

**Modified:**
- `src/renderer.js` (add `renderWalk`)
- `index.html`, `styles.css`

### Tasks (summary)

- [ ] **3.1** Define `WalkStep` type (already in CLAUDE.md) and `generateWalk(state)` signature.
- [ ] **3.2** TDD: "project overview" step always present, content references actual file/lang counts.
- [ ] **3.3** TDD: entry-points step — only appears if any file matches the entry regex; lists matched files in deterministic alpha order.
- [ ] **3.4** TDD: core modules — top 3 by `lineCount`, ties broken by path asc.
- [ ] **3.5** TDD: complexity hotspots — only if any fn `cx >= 7`; lists files containing those fns.
- [ ] **3.6** TDD: utilities, config — regex-matched, deterministic order.
- [ ] **3.7** TDD: external deps — aggregates unique `lib`s with file-counts; sorted by count desc, lib asc as tiebreak.
- [ ] **3.8** Snapshot test: given a fixed 6-file fixture, `generateWalk` returns the exact expected step array.
- [ ] **3.9** `renderWalk`: prev/next buttons, step counter, `←/→` keybindings, click on file path navigates detail.
- [ ] **3.10** Smoke test: walk through a real repo, verify each step makes sense.

### Phase 3 exit criteria
- [ ] Snapshot test stable across runs (determinism guarantee).
- [ ] Walk panel keyboard-accessible.

---

# PHASE 4 — Design-system migration to tabbed shell

**Goal of phase:** Replace the interim 3-column layout (sidebar / detail / walk-panel) with the shell defined in `docs/plans/design.md`: top toolbar + 200px sidebar + stat bar + tab-switched main panel. Implements the Overview, Walk, Functions, and Libraries tabs. Trace and Graph tabs come in Phases 5 and 6 respectively but their tab pills exist (disabled) starting in this phase.

**Why this phase exists:** the Phase 2/3 UI was demo-functional but visually wrong — the walk panel competed with detail panel for horizontal space, panels could overlap on narrow viewports, and the typography did not match the spec. The data layers (`parser`, `analyzer`, `walker`) are unchanged; only `index.html`, `styles.css`, and `renderer.js` are rewritten.

**New files:**
- `src/tabs.js` — owns active-tab state and `setActiveTab(name)` mutator
- `src/views/overview.js` — `renderOverview()`: 4-card bar charts (lines/fns/cx/lang)
- `src/views/walk.js` — `renderWalk()`: walk-bar, progress trail, highlight card, files/fns chips, note strip
- `src/views/functions.js` — `renderFunctions()`: sortable flat function list with cx badges
- `src/views/libraries.js` — `renderLibraries()`: 3-col library cards w/ usage bars + stdlib detection
- `src/sidebar.js` — `renderSidebar()`: 200px file list w/ filter input, ext badges, cx values, active-state left-border
- `src/toolbar.js` — `renderToolbar()`: logo, tab pills, project badge, drop button
- `src/statbar.js` — `renderStatBar()`: 5-cell summary (lines / fns / libs / avg cx / langs)

**Modified:**
- `index.html` — full restructure into `.root > .toolbar + .layout (.sidebar + .main)` per design.md "Page structure"
- `styles.css` — full rewrite: import IBM Plex Mono/Sans, define `--bg/--bg2/--bg3/--text/--muted/--border/--border2`, accent + complexity tokens, language colors, spacing scale, 0.5px borders everywhere
- `src/renderer.js` — becomes a thin dispatcher: `renderAll()` calls toolbar + sidebar + statbar + active-tab view
- `src/state.js` — adds `activeTab`, `sidebarFilter`, `functionsSort` fields

### Tasks

- [ ] **4.1** Wire fonts + color tokens. Add `@import` for IBM Plex Mono/Sans, declare every variable in design.md `Color tokens` section, including light/dark adaption via `@media (prefers-color-scheme: dark)`. Verify in DevTools that `getComputedStyle(document.body).fontFamily` resolves to `IBM Plex Mono` after page load.
- [ ] **4.2** Restructure `index.html` skeleton to `<div class="root"><div class="toolbar"></div><div class="layout"><aside class="sidebar"></aside><main class="main"></main></div></div>`. Remove the old `#workspace` 3-col grid and the standalone `#walk` aside.
- [ ] **4.3** Implement `src/toolbar.js` per design.md "Toolbar": logo (`codemap` 500 + `v2` muted), tab pills group (`Overview Walk Functions Trace Graph Libraries`), spacer, project badge, drop button. `Trace` and `Graph` pills get a `disabled` class until Phases 5 / 6 land. Clicking a pill calls `setActiveTab(name); renderAll()`.
- [ ] **4.4** Implement `src/tabs.js` with a default of `'overview'`. Render dispatcher in `renderer.js` selects which view module's render function to call.
- [ ] **4.5** Implement `src/sidebar.js` per design.md "Sidebar": two sections (`FILES` w/ count badge, then file list). Filter input live-filters by substring on `f.path`. File item shows ext badge (lang color, 13% alpha background), filename ellipsis, cx value colored per the complexity rule. Active item gets `border-left: 2px solid var(--accent)`.
- [ ] **4.6** Implement `src/statbar.js` per design.md "Stat bar": 5 cells, each with label / value / sub. Pull values straight from `STATE.files`; complexity cell color derived from `--success / --warn / --danger`.
- [ ] **4.7** Implement `src/views/overview.js`: 4 cards in a 2-col grid — Lines by file, Functions by file, Complexity by file (sorted desc, fill colored by cx rule), Language breakdown. Use the bar-row pattern from design.md verbatim.
- [ ] **4.8** Implement `src/views/walk.js`: rebuild Phase 3's walk UI as a full-width tab body matching design.md "Walk tab" — walk-bar header, progress dots row (clickable), highlight card colored by `STEP_COLORS[category]`, optional Files / Functions cards as chip rows, note strip with accent left-border. Keep ←/→ arrow nav.
- [ ] **4.9** Implement `src/views/functions.js`: toolbar strip with sort `<select>` (Name / Lines ↓ / Complexity ↓ / Connections ↓), right-aligned function-count label, scrollable rows showing fn name (accent), filename, line count `"NL"`, cx badge using `.cx-low/.cx-mid/.cx-high`. Click → in Phase 5 will switch to Trace; in Phase 4 it just toasts a TODO.
- [ ] **4.10** Implement `src/views/libraries.js`: aggregate `STATE.files[*].imports` into `{lib, count, type}` records using the exact stdlib set from design.md. Render as 3-col cards w/ name + usage count + proportional bar + `stdlib`/`external` label.
- [ ] **4.11** Drag-and-drop overlay (`docs/plans/design.md` "Drag & drop overlay"): absolute over `.main`, shown on `dragenter`, hidden on `dragleave`/`drop`. Replaces the old `#dropzone` element entirely.
- [ ] **4.12** Splash / empty states: when `STATE.files.length === 0`, Overview and Walk panels show the upload-splash block (icon, title, subtitle, demo button placeholder).
- [ ] **4.13** Manual smoke: load a 50-file repo, click each tab, verify panels do not overlap at any viewport ≥ 1024px, verify font is IBM Plex Mono everywhere except walk-card body/title.
- [ ] **4.14** Audit `innerHTML` usage in the new view modules — every dynamic string must go through `textContent` or be escaped.

### Phase 4 exit criteria
- [ ] All four tabs (Overview / Walk / Functions / Libraries) render without console errors on a real repo.
- [ ] Sidebar is exactly 200px wide; layout stays stable down to 1024px viewport.
- [ ] Typography matches design.md (IBM Plex Mono for all data, IBM Plex Sans for walk prose).
- [ ] No remaining references to the old `#workspace` / `#detail` / `#walk` ids.

---

# PHASE 5 — Trace tab

**Goal of phase:** Implement the Trace tab per design.md. Roots a call-tree view at any function and shows same-file co-locations as a heuristic stand-in for true call edges (CLAUDE.md forbids per-fn AST).

**New files:**
- `src/views/trace.js`
- `src/trace-graph.js` — pure function `buildTraceTree(rootFn, files)` returning `{fn, children: TraceNode[]}` deterministically using same-file co-occurrence ordered by line number; cycle-safe.
- `tests/trace.test.js`

### Tasks

- [ ] **5.1** TDD: `buildTraceTree` returns deterministic, cycle-safe tree for fixed input.
- [ ] **5.2** Header strip with root-function `<select>` populated by all functions, format `"name (filename.ext)"`.
- [ ] **5.3** Two-col body: 240px tree panel + flex detail panel.
- [ ] **5.4** Trace tree node rendering per design.md (dot + vline connector, indent = depth × 16px, warn-colored dot for cx≥7).
- [ ] **5.5** Detail panel: fn name, sub-line `{file} · line N · N lines · complexity {N}` (cx colored), `Same-file functions` pill row, file path.
- [ ] **5.6** Click `.pill.out` → re-root trace; click trace node → update detail panel.
- [ ] **5.7** Functions tab row click and Walk function-chip click both navigate to Trace + set root.
- [ ] **5.8** Enable the Trace tab pill in the toolbar.

### Phase 5 exit criteria
- [ ] Trace tree builds in O(fns × avg-deg) and renders <50ms for 2000 fns.
- [ ] Re-rooting and node selection have no console errors.

---

# PHASE 6 — Graph tab (canvas)

**Goal of phase:** Implement the Graph tab per design.md. Files as circles arranged circularly; size ∝ √lineCount; edges = shared import OR same language. Hover highlights neighbors; click selects in sidebar.

**New files:**
- `src/graph.js`
- `tests/graph.test.js`

### Tasks

- [ ] **6.1** Pure `computeLayout(files, W, H)` → `[{path, x, y, r}]`. Deterministic snapshot test on a 4-file fixture.
- [ ] **6.2** Pure `computeEdges(files)` → `[{a, b}]` (shared import OR same language). Tests cover all three cases.
- [ ] **6.3** `renderGraph(canvas, state)` per design.md: HiDPI scaling, edges low-alpha first then nodes, label below each node truncated to 10 chars + ellipsis, dark-mode label color.
- [ ] **6.4** Hover via squared-distance check; highlight node + neighbor edges.
- [ ] **6.5** Click → `selectPath(path); setActiveTab('functions')` (or stay on graph but flash the file in sidebar — TBD during build).
- [ ] **6.6** `ResizeObserver` re-renders on container size change.
- [ ] **6.7** Enable the Graph tab pill in the toolbar.

### Phase 6 exit criteria
- [ ] Graph renders <100ms for 500-file repo.
- [ ] No artifacts on resize; pixel-crisp on HiDPI displays.

---

# PHASE 7 — Polish, perf, docs

### Tasks

- [ ] **7.1** Add `performance.now()` checkpoints in `analyzer.js` gated behind `?perf=1`.
- [ ] **7.2** Run perf benchmarks on a 500-file fixture; record in `PERF.md`.
- [ ] **7.3** Escaping audit across every `innerHTML` use site.
- [ ] **7.4** Keyboard nav: `j/k` through file list, `Enter` selects, `[` / `]` cycles walk steps, `1`–`6` jumps to tabs.
- [ ] **7.5** Empty / error states: too-large repo warning, parse-failure guidance.
- [ ] **7.6** README: what it is, screenshot, "drag a folder onto index.html", supported langs, how to add a language.
- [ ] **7.7** Final QA on three real repos of varied size/lang.
- [ ] **7.8** Tag `v0.1.0`.

### Phase 7 exit criteria
- [ ] All five perf targets in CLAUDE.md met or documented.
- [ ] README sufficient for new user productivity in <2 min.
- [ ] No `innerHTML` site uses unescaped user data.

---

## Cross-cutting reminders (read before each phase)

- No build step. Ever. Modules are loaded directly.
- No CDN for parsing/analysis logic.
- No npm, no `package.json`, no installs. Tests run by opening `tests.html`.
- Each new `*.test.js` file (Phase 2 onward) must be appended to the import list in `tests.html` so its `test()` calls register before `report()` runs.
- Every `render*` function: idempotent, reads only from `STATE`.
- Every regex: paired with at least one positive test, one keyword false-positive test.
- Adding a language = one entry in `lang-config.js` + tests. No other file changes.
- Frequent commits — each task ends with a commit.
