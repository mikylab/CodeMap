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
- **Walk** — auto-generated guided walkthrough driven by the call graph and
  import graph (with filename heuristics as fallback). Order: overview →
  archetype → entry points → first hop → core modules → boundary → complexity
  hotspots → utilities → config → orphans → external deps. Steps without
  signal are skipped. Use ←/→ or click progress dots to navigate. Function
  chips jump to Trace, so Walk doubles as an index into the execution map.
- **Functions** — sortable flat list (by name, lines, or complexity). Clicking a
  row roots the Trace tab at that function.
- **Trace** — execution map driven from the sidebar. Click a file in the
  sidebar to expand it inline and see its functions; click a function to
  trace what it executes. Codemap renders a DAG of every in-codebase
  function called (transitively), with each node showing file, function,
  complexity, fan-in/out, and a `+N ext` count for external/library calls
  (collapsed, not drawn). Edges colored by inference confidence: green =
  same-file, purple = via local import, gray-dashed = single-name guess.
  A **breadcrumb trail** at the top tracks every step you take — the green
  origin marker is where you started; click any crumb to jump back, or use
  ←/→ buttons. Right panel summarizes the current map's *reach*, *files*,
  *depth*, and *hotspots*, with click-to-jump pills for the worst offenders.
  Double-click a node on the map to drill in; click *reset* to start the
  trail over from the current spot.
- **Smells** — heuristic findings for code that may not behave as it claims.
  Five detectors:
  - *hallucinated calls* — call sites whose name has no definition or import
    in the repo (common in LLM-generated code)
  - *broken imports* — relative imports that resolve to nothing
  - *suspicious comments* — TODO / FIXME / HACK / "for now" / placeholder /
    stub / mock / etc.
  - *swallowed catches* — `catch (e) {}` / `except: pass` / silent Go err
    returns
  - *placeholders* — `localhost`, `YOUR_API_KEY`, `foo`/`bar`, `TODO` strings,
    magic ports
  Filter by kind, click a finding to open its file. Each file in the sidebar
  shows a coloured dot (red = ≥1 warn, yellow = info-only) you can click to
  filter the tab to that file.
- **Libraries** — every external/stdlib import aggregated, sorted by usage,
  with `stdlib` vs `external` labels.

## Effects (badges across tabs)

Every function is tagged with the side-effects its body performs:
`net · fs · db · exec · dom · env`. Direct effects render as solid pills
(the function itself touches it), inherited effects as outlined pills (a
callee somewhere down the chain does). Surfaces:

- **Sidebar** — 6-slot effect strip beneath each file row.
- **Functions tab** — badges per row, plus filter chips at the top so you can
  isolate "every function that touches the network", etc.
- **Trace tab** — badges in the selected-node detail pane.

Detection is import-based (`import fs from 'fs'` → `fs`) plus a small set of
patterns (`document.*` → `dom`, `process.env` → `env`, etc.), all run after
strings and comments are stripped to suppress false positives.

## Path painter

Right-click a file node on the **Graph** tab — or a function row on the
**Functions** tab — to set it as the path **start**; right-click a second
to set the **end**. A chip strip appears at the top of Graph and Trace
showing both endpoints and the number of paths found. Non-path nodes fade
on the Graph so the focal subgraph stands out. Click **clear ✕** to drop
the painter. Setting only a start (no end) shows the forward reach;
toggle the **reverse** chip to flip to "everything that can reach here".

Mixing fn-level and file-level endpoints in one painter session is
blocked — clear the painter to switch modes.

## Keyboard shortcuts

- **1–7** — jump to tab (Overview / Walk / Functions / Trace / Graph / Smells / Libraries)
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
│   ├── effects.js          # tagFns + reverse-BFS propagation (net/fs/db/…)
│   ├── effects-config.js   # EFFECT_LIBS, EFFECT_PATTERNS, BUILTINS per language
│   ├── effect-badges.js    # pill / strip render helpers
│   ├── smells.js           # 5 detectors → SmellFinding[]
│   ├── paths.js            # findPaths / findReach (BFS, simple paths)
│   ├── toolbar.js / sidebar.js / statbar.js / dom.js
│   └── views/{overview,walk,functions,trace,trace-graph-view,
│             graph,libraries,smells,paint-strip}.js
└── tests/                  # browser-run tests, no Node required
```

State lives in one `STATE` object. Every `render*` is idempotent and reads only
from `STATE`. All parsing is regex-based and deterministic. See `CLAUDE.md` for
philosophy and `docs/plans/` for the staged plan.

## Tests

Open `tests.html`. Each test prints green ✓ / red ✗ to the page. No Node, no
npm, no installs — same runtime as the app.
