# Codemap

Browser-native, zero-dependency code intelligence. Drop a folder, get an
interactive workspace for understanding an unfamiliar codebase. **No server,
no LLM, no build step, no `npm install`.** Everything runs locally in your
browser.

**[▶ Try it live](https://mikylab.github.io/CodeMap/)** — no install, runs
entirely in your browser. Or paste a public `github.com/owner/repo` URL into
the app to explore any repo.

## Run it locally

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

You can also click **Load URL** and paste a `github.com/owner/repo` or
`gitlab.com/group/repo` URL (with optional `/tree/branch` suffix). Codemap
fetches the tree and raw files directly from the host's public REST API — no
proxy or backend. GitHub anonymous calls are capped at 60/hr per IP; paste a
personal access token in the modal to raise that to 5000/hr (token is kept in
`sessionStorage` only, never sent anywhere else). Loads are capped at 500
files per repo.

## Workspace

Codemap is a single two-pane workspace, not a stack of tabs.

```
┌────────────────────────────────────────────────────────────────┐
│ codemap   [🗺 Walk] [◉ Graph]    NET FS DB EXEC DOM ENV   ⚠ 23 │
├────────────────────────┬───────────────────────────────────────┤
│ ⌂ Repo    23 files     │  src/parser.js          PY  120L      │
│ 🔍 search files & fns  │  ─────────────────────────────────    │
│  ▾ src/                │  [Summary] [Source] [Calls] [Risk]    │
│    ⚠ parser.js         │            [Deps]                     │
│      ▾ parseFile (fn)  │                                       │
│      • extractFns (fn) │  EFFECTS  [net] [fs]                  │
│  ▾ tests/              │  FUNCTIONS (12)                       │
│                        │   parseFile  L12  cx:8  [net]         │
│                        │   extractFns L84  cx:5                │
│                        │   …                                   │
└────────────────────────┴───────────────────────────────────────┘
```

**Top bar** — `Walk` / `Graph` open full-screen overlays. Six effect chips
(`net · fs · db · exec · dom · env`) filter the navigator. The `⚠ N` badge
opens a full-screen Smells view; `✓ clean` if there are no findings.

**Navigator (left)** — unified tree of files (and their functions, when a
file is selected). The search box flips the navigator into flat
`file › function` results that match anywhere in the repo. Each file row
shows a smell dot (red = ≥1 warn, yellow = info-only). Effect chips above
narrow what's shown.

**Detail pane (right)** — what you're looking at depends on what's
selected on the left:

- **Nothing selected** (`⌂ Repo`) → repo overview: charts of lines /
  functions / complexity / languages, plus a Risk mode for all smells and
  a Deps mode for the library breakdown.
- **A file selected** → Summary (effects, top functions by complexity,
  smells, importers), Source, Calls (pick a fn), Risk (smells in this
  file), Deps (imports + importers).
- **A function selected** → Summary (callers, callees, smells in this fn,
  source preview), Source, Calls (full execution map DAG), Risk.

Mode chips above the detail pane are sticky — picking *Source* on one
function keeps you on Source as you navigate to siblings.

**Reading source.** Source view is interactive: call sites and resolved
import tokens are clickable and jump to their definition. Hover any link
for a card showing the target's signature, file:line, and (when present)
the first line of its docstring/JSDoc — plus an "Open Flow →" button.

**Flow** (new mode chip on functions) — answers "what does this function
consume and produce?" Params and read-effects on the left, returns and
write-effects on the right, plus the literal argument expressions every
caller passes in and what each caller binds the return value to. Distinct
from Calls, which shows reach; Flow shows arguments.

**Back / breadcrumbs.** Codemap remembers the last 20 navigation hops
within the workspace. A back button (also `Backspace` or `Alt+←`) and a
small breadcrumb trail under the title let you retrace a path through
Walk → file → function → Flow → caller without losing the thread.

## Walk, Graph, Smells (full-screen modes)

Open from the top bar; close with **Esc** or the back button.

- **🗺 Walk** — guided tour driven by the call graph and import graph
  (with filename heuristics as fallback). Order: overview → archetype →
  entry points → first hop → core modules → boundary → complexity hotspots
  → utilities → config → orphans → external deps. Clicking any chip in a
  step jumps the workspace to that file/function and exits Walk.
- **◉ Graph** — files as nodes, imports as edges. Circular layout, node
  size ∝ √lineCount. Click a node to select it in the workspace;
  double-click to exit Graph and stay on it. Right-click two nodes to
  paint paths between them.
- **⚠ Smells** — every heuristic finding across the repo, filterable by
  kind. Click any finding to open the file in the workspace.

## Effects badges

Every function is tagged with the side-effects its body performs:
`net · fs · db · exec · dom · env`. Direct effects render as solid pills,
inherited (via callees) as outlined. Detection is import-based
(`import fs from 'fs'` → `fs`) plus patterns (`document.*` → `dom`,
`process.env` → `env`, …) run after strings and comments are stripped.
Top-bar chips filter the navigator to functions touching that effect.

Smell detectors:

- *hallucinated calls* — call sites whose name has no definition or import
- *broken imports* — relative imports that resolve to nothing
- *suspicious comments* — TODO / FIXME / HACK / "for now" / stub / mock / …
- *swallowed catches* — `catch (e) {}` / `except: pass` / silent Go err returns
- *placeholders* — `localhost`, `YOUR_API_KEY`, `foo`/`bar`, magic ports

## Path painter

Right-click a file node on the **Graph** to set the path **start**;
right-click a second to set the **end**. A chip strip shows both
endpoints and the number of paths found. Non-path nodes fade. Click
**clear ✕** to drop the painter. Setting only a start shows forward
reach; toggle **reverse** to flip to "everything that can reach here".

## Keyboard shortcuts

- **1 / 2 / 3** — toggle Walk / Graph / Smells overlay
- **Esc** — exit full-screen overlay
- Type in the navigator search box to filter

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
│   ├── git-fetch.js        # GitHub / GitLab URL → ParsedFile[] (CORS, no server)
│   ├── git-modal.js        # "Load URL" modal UI
│   ├── state.js            # STATE singleton + mutators + indexes
│   ├── tabs.js             # complexity buckets, stdlib set
│   ├── renderer.js         # workspace dispatcher (renderAll)
│   ├── toolbar.js          # top bar: modes, effect chips, smell badge
│   ├── navigator.js        # left pane: search-first file/fn tree
│   ├── effects.js          # tagFns + reverse-BFS propagation (net/fs/db/…)
│   ├── effects-config.js   # EFFECT_LIBS, EFFECT_PATTERNS, BUILTINS
│   ├── effect-badges.js    # pill / strip render helpers
│   ├── smells.js           # 5 detectors → SmellFinding[]
│   ├── paths.js            # findPaths / findReach (BFS, simple paths)
│   ├── statbar.js / dom.js / perf.js
│   └── views/
│       ├── workspace.js    # right pane: detail modes (summary/source/…)
│       ├── fullscreen.js   # overlay shell for Walk / Graph / Smells
│       ├── overview.js     # repo charts (embedded in workspace summary)
│       ├── walk.js / graph.js / smells.js   # full-screen views
│       ├── trace-graph-view.js              # DAG renderer
│       └── paint-strip.js                   # path-painter chip strip
└── tests/                  # browser-run tests, no Node required
```

State lives in one `STATE` object. Every `render*` is idempotent and reads only
from `STATE`. All parsing is regex-based and deterministic. See `CLAUDE.md` for
philosophy, `docs/design.md` for the design notes, and `CHANGELOG.md` for the
release history. Working plans live in `docs/plans/` locally but are not
tracked in git.

## Tests

Open `tests.html`. Each test prints green ✓ / red ✗ to the page. No Node, no
npm, no installs — same runtime as the app.

## License

[MIT](LICENSE) © Mikyla Bowen
