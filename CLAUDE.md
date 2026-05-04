# CLAUDE.md — Codemap

Codebase-agnostic, browser-native code intelligence tool.
**Zero LLM dependency.** All parsing is deterministic and runs client-side.

---

## Project philosophy

1. **No server, no LLM.** Every feature must work purely in the browser via File System API / drag-and-drop. If a feature requires an API call to work, it should not exist.
2. **Language-agnostic by config.** All language support is expressed as a `LANG_CONFIG` entry (regexes for functions, imports, comment syntax). Adding a language means adding one config block — nothing else.
3. **Deterministic output.** Given the same files, Codemap must produce the same metrics, graph, and walk steps every time. No randomness, no sampling, no LLM inference.
4. **Parse fast, render faster.** Parsing must complete in <2s for repos up to 500 files. Rendering must not block the main thread.

---

## Architecture

```
codemap/
├── index.html          # Single-file entry, no build step required
├── src/
│   ├── parser.js       # Language-agnostic file parser (pure functions)
│   ├── analyzer.js     # Metrics, call graph inference, complexity
│   ├── walker.js       # Walk step generator (deterministic)
│   ├── renderer.js     # All DOM rendering (no frameworks)
│   ├── graph.js        # Canvas dep graph
│   └── lang-config.js  # LANG_CONFIG — one entry per language
├── CLAUDE.md           # This file
└── README.md
```

### Module responsibilities

- **parser.js** — reads raw file text, extracts functions/imports/classes via regex. Pure input → output, no side effects. Returns a `ParsedFile` object.
- **analyzer.js** — takes an array of `ParsedFile`, computes per-file cyclomatic complexity, cross-file import edges, connectivity scores.
- **walker.js** — takes analyzed state, emits an ordered array of `WalkStep` objects deterministically. Steps are: overview → entry points → core modules → complexity hotspots → utilities → config → deps.
- **renderer.js** — owns all `document.*` calls. Receives state, returns nothing. Must be re-renderable from scratch (idempotent).
- **graph.js** — canvas-based dep graph. Nodes = files, edges = imports. Layout: circular with node size ∝ line count.
- **lang-config.js** — exports `LANG_CONFIG`. Each entry: `{ name, color, fn: [RegExp], imports: [RegExp], comment }`.

---

## Data model

```js
// ParsedFile
{
  name: string,          // filename
  path: string,          // relative path from repo root
  ext: string,           // lowercase extension
  lang: string,          // e.g. "Python"
  langColor: string,     // hex color
  lineCount: number,
  cx: number,            // avg cyclomatic complexity
  fns: ParsedFn[],
  imports: Import[]
}

// ParsedFn
{
  name: string,
  file: string,          // path of containing file
  lineNum: number,       // 1-indexed
  lines: number,         // estimated body length
  cx: number,            // cyclomatic complexity of this function
  calls: string[]        // distinct callee names found in body via regex (sorted, deduped)
}

// Import
{
  from: string,          // path of importing file
  lib: string            // raw import string (before splitting on / or .)
}

// CallEdge (from analyzer)
{
  from: string,          // fnKey of caller
  to: string,            // fnKey of resolved target
  confidence: 'high'|'med'|'low'
}

// WalkStep
{
  title: string,
  category: 'meta'|'entry'|'core'|'complexity'|'utils'|'config'|'deps',
  content: string,       // 1-2 sentence description (generated from data, not LLM)
  files: string[],       // relevant file paths
  fns: string[],         // relevant function names
  note: string           // actionable tip for the developer
}
```

---

## Parser rules

### Function detection
- Use per-language regex arrays from `LANG_CONFIG.fn`
- Filter out keyword false positives: `if for while switch return class import export const let var def function async`
- Minimum function name length: 2 characters
- Capture group priority: `m[1] || m[2] || m[3]` (language regexes may use alternation)

### Complexity estimation
Count decision points in file source (not per-function — file-level approximation):
```
score = 1 + count(if) + count(else) + count(for) + count(while)
      + count(case) + count(catch) + count(&&) + count(||)
      + count(?) + count(switch)
```
Per-file complexity = `score / max(fn_count, 1)`, clamped to `[1, 30]`.

### Import normalization
- Strip relative paths: skip anything starting with `.` or `/`
- Take only the root segment: `torch.nn.functional` → `torch`
- Deduplicate per-file

### Files to skip
**Directories:** `node_modules .git dist build .next __pycache__ .venv venv env coverage .cache`
**Extensions:** `png jpg jpeg gif svg ico woff woff2 ttf eot lock min.js min.css map zip tar gz`

---

## Walk step generation

Walk steps are generated deterministically from parsed state. All string content must be constructed from data (file names, counts, line numbers) — never hardcoded.

Walker prefers **call-graph and import-graph signal** over filename heuristics. Filename regex is a fallback when graph data is sparse.

| Step | Condition | Source of signal |
|---|---|---|
| Project overview | always | file/lang counts |
| Project archetype | any import matches a known framework lib (web / CLI / worker / desktop) | `f.imports[].lib` ∩ `ARCHETYPES[].libs` |
| Entry points | any fn with `fanIn = 0` and `transitiveReach ≥ 3`, OR filename matches `/\b(main\|index\|app\|run\|server\|cli\|__main__)\b/i` | `STATE.fanIn`, `STATE.callsByFn`; filename as fallback |
| First hop | top entry fn has any resolved callees | top callees ranked by `STATE.fanOut` |
| Core modules | always | top 3 by **incoming import count** (`STATE.fileImporters`); falls back to `lineCount` when no import edges resolved |
| Boundary | any file imports a lib in the `BOUNDARY_LIBS` set (network / fs / db / cloud) | `f.imports[].lib` ∩ `BOUNDARY_LIBS` |
| Complexity hotspots | any fn with `cx ≥ 7` | ranked by `cx × (1 + fanIn)`, not raw `cx` |
| Utilities | filename matches `/\b(util\|helper\|common\|shared\|lib\|tools\|core)\b/i` | filename only |
| Config/schema | filename matches `/\b(config\|settings\|schema\|constants\|env\|types\|interfaces)\b/i` | filename only |
| Orphans | files with no incoming import edges and no fns appearing as call targets, excluding entries and tests | `STATE.fileImporters`, `STATE.fanIn` |
| External deps | always | aggregated `f.imports` |

Steps for which the condition is not met are omitted entirely. Walker degrades gracefully when call-graph maps are missing — it falls back to filename / lineCount signal so it still produces a useful tour on a parse-only state.

---

## Coding standards

### General
- No build step. The tool must run by opening `index.html` directly.
- No external runtime dependencies (no React, no Vue, no bundler).
- CDN-loaded libraries are allowed for the canvas graph only (no CDN for core parsing logic).
- All state lives in a single `STATE` object. Never store state in the DOM.
- Functions must be pure where possible. Side-effecting functions (DOM writes) must be clearly named `render*`.

### Parser (parser.js)
- Every regex must have a corresponding test case in `parser.test.js`
- `parseFile(name, src, path)` must return `null` for unsupported extensions — never throw
- No mutation of input strings
- Add a new language by adding one entry to `LANG_CONFIG` — no other file changes required

### Renderer (renderer.js)
- Every `render*` function must be idempotent — calling it twice must produce the same DOM
- Never read from the DOM to determine state — always read from `STATE`
- Never use `innerHTML` for user-controlled strings — escape before inserting

### Graph (graph.js)
- Layout algorithm: circular placement, `angle = (i/N) * 2π`, node radius ∝ `√(lineCount)`
- Edge condition: files that share a detected import, or share the same language
- Must re-render cleanly on window resize via `ResizeObserver`

---

## Adding a language

1. Open `lang-config.js`
2. Add an entry:
```js
rb: {
  name: 'Ruby',
  color: '#E24B4A',
  fn: [/def\s+(\w+)/gm],
  imports: [/require\s+["']([^"']+)["']/gm],
  comment: '#'
}
```
3. Add test cases to `parser.test.js` for at least one function and one import
4. Done — no other changes needed

---

## Performance targets

| Operation | Target |
|---|---|
| Parse 100 files (avg 300 lines) | < 500ms |
| Parse 500 files | < 2s |
| Render sidebar (500 files) | < 50ms |
| Render function list (2000 fns) | < 100ms |
| Graph canvas render | < 100ms |

Use `performance.now()` checkpoints in `analyzer.js` and log to console in development.

---

## What not to do

- Do not add an LLM API call for any feature. If a feature requires inference, remove it.
- Do not add a backend or server. Everything is client-side.
- Do not add a build step unless the codebase exceeds 5 source files. Prefer a single `index.html`.
- Do not add a framework. Vanilla JS + CSS variables only.
- Do not add full AST parsing for the call graph. Per-function call inference is regex-only: extract call sites with a name-followed-by-`(` pattern, then resolve names to definitions via same-file lookup, relative-import disambiguation, or single-name match. Mark ambiguous and unresolved calls visibly so users see the heuristic's confidence.
- Do not render user-provided file paths or function names as raw HTML — always escape.

---

## Testing

```
parser.test.js   — unit tests for parseFile() across all supported languages
walker.test.js   — snapshot tests for walkStep generation given fixed ParsedFile arrays
analyzer.test.js — unit tests for complexity estimation and import normalization
```

Run with any test runner that supports ES modules (e.g. `node --experimental-vm-modules node_modules/.bin/jest`).

Each language in `LANG_CONFIG` must have at least:
- 1 test for function extraction
- 1 test for import extraction
- 1 test for a false-positive keyword that should NOT be captured
