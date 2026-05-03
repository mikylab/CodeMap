# Codemap

Browser-native, zero-dependency code intelligence. Drop a folder, get a guided tour
of an unfamiliar codebase — file metrics, complexity hotspots, a step-by-step
walkthrough, a function trace tree, and a library breakdown. **No server, no LLM,
no build step, no `npm install`.** Everything runs locally in your browser.

## Run it

```sh
cd CodeMap
python3 -m http.server 8000
```

Then open:
- **App:** http://localhost:8000/index.html
- **Tests:** http://localhost:8000/tests.html

(ES modules require `http://`, not `file://`. Any static server works:
`npx serve`, `php -S`, etc.)

Drag a folder onto the page — or click **Drop repo / files** to use the directory
picker. Files are read locally; nothing leaves your machine.

## Tabs

- **Overview** — bar charts of lines, functions, complexity, and language mix.
- **Walk** — auto-generated guided walkthrough: project overview → entry points
  → core modules → complexity hotspots → utilities → config → external deps.
  Use ←/→ or click progress dots to navigate. Function chips jump to Trace.
- **Functions** — sortable flat list (by name, lines, or complexity). Clicking a
  row roots the Trace tab at that function.
- **Trace** — pick a root function and see its execution path: regex-inferred
  callees, expanded across files via import disambiguation. Toggle between
  **Tree** (indented call hierarchy) and **Graph** (SVG DAG with arrows). Each
  edge is colored by confidence — `same-file` (green), `imported` (purple),
  `guess` (gray dashed); ambiguous and unresolved calls are flagged. The detail
  pane shows complexity, fan-in / fan-out, callers, and resolved callees.
- **Libraries** — every external/stdlib import aggregated, sorted by usage,
  with `stdlib` vs `external` labels.

## Keyboard shortcuts

- **1–6** — jump to tab (Overview / Walk / Functions / Trace / Graph / Libraries)
- **← →** or **[ ]** — previous / next walk step
- **j / k** — move down / up in the file sidebar

Append `?perf=1` to the URL to log parse / analyze / render timings to the console.
Files larger than 2MB are skipped; a banner above the stat bar lists how many.

## Supported languages

JavaScript / JSX / TypeScript / TSX, Python, Go, Rust, Ruby, Java.

## Add a language

Edit `src/lang-config.js` and add one entry:

```js
ext: {
  name: 'YourLang', color: '#hex', comment: '//',
  fn:      [/regex capturing function names/gm],
  imports: [/regex capturing imported lib/gm],
}
```

Then add at least one positive test, one import test, and one keyword
false-positive test in `tests/parser.test.js`. No other file changes needed.

## Architecture

```
CodeMap/
├── index.html              # entry — single page, no build
├── styles.css
├── src/
│   ├── lang-config.js      # LANG_CONFIG (regex per language)
│   ├── parser.js           # parseFile(name, src, path) → ParsedFile
│   ├── analyzer.js         # cross-file edges + connectivity
│   ├── walker.js           # generateWalk(state) → WalkStep[]
│   ├── trace-graph.js      # buildTraceTree(rootFn, callsByFn, fnByKey)
│   ├── ingest.js           # drag-drop / dir-picker → ParsedFile[]
│   ├── state.js            # STATE singleton + mutators + indexes
│   ├── tabs.js             # tab registry, complexity buckets, stdlib set
│   ├── renderer.js         # tab dispatcher (renderAll)
│   ├── toolbar.js / sidebar.js / statbar.js / dom.js
│   └── views/{overview,walk,functions,trace,trace-graph-view,libraries}.js
└── tests/                  # browser-run tests, no Node required
```

State lives in one `STATE` object. Every `render*` is idempotent and reads only
from `STATE`. All parsing is regex-based and deterministic. See `CLAUDE.md` for
philosophy and `docs/plans/` for the staged plan.

## Tests

Open `tests.html`. Each test prints green ✓ / red ✗ to the page. No Node, no
npm, no installs — same runtime as the app.
