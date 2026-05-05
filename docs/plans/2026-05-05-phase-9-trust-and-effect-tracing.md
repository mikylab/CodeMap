# Phase 9 — Trust & Effect Tracing

**Goal:** Extend Codemap from "what is this code?" to "*can I trust this code, and what does it actually do to the world?*" Three additions, all client-side, all deterministic, no LLM:

1. **Effects (9a)** — tag every function with the side-effects it has (`net fs db exec dom env`), propagate transitively through the call graph, surface badges in Trace / Functions / Sidebar.
2. **Smells (9b)** — four detectors aimed at LLM-generated and grown-organically code: unresolved references (hallucinated calls), suspicious comments, swallowed catches, magic placeholders. Triage tab + sidebar dots.
3. **Path painter (9c)** — pick two functions or two files, paint every call path between them on the Graph and Trace tabs, with non-path nodes faded so the focal subgraph stands out *more*, not less.

**Primary user:** A reviewer of code they didn't fully write — either inheriting an LLM-generated PR, or having vibecoded a project that grew past their mental model. Their core question is "can I believe this code does what it claims?" Every feature in this phase answers a sub-question of that.

**Non-goals:** No LLM, no server, no AST parsing for the call graph (heuristic regex resolution only — same constraint as Phases 5–6). No near-duplicate detection or style-inconsistency reports in v1 (deferred — too noisy without tuning). No mixing fn-level and file-level paint endpoints in a single paint session.

**Architecture fit:** Three pure-data layers slot on top of existing `STATE`. Rendering is additive — one new tab (Smells), badges added to existing tabs, paint as a *mode* toggled within Graph and Trace (not a new tab). No existing module changes shape. Phase 8 (history/annotations/risk) and Phase 9 are independent and can ship in either order.

---

## Sub-phases at a glance

| Sub-phase | Deliverable | Demo-able outcome |
|---|---|---|
| **9a — Effects** | `effects.js` + `effects-config.js`; effect badges on Trace / Functions / Sidebar | Drop a repo. Every fn shows direct effects (solid pills) and inherited effects (outlined pills). Functions tab gains effect filter chips. Sidebar shows a 6-dot effect strip per file. |
| **9b — Smells** | `smells.js`; new Smells tab; sidebar smell dot | Sidebar lights red on files with hallucinated calls, empty catches, suspicious comments, magic placeholders. Smells tab gives triage list with severity filter chips and click-through to file. |
| **9c — Path painter** | `paths.js`; paint mode in Graph and Trace | Right-click two fns → "Set as start/end". Graph fades non-path nodes hard, draws path with effect-colored rings on endpoints. Trace tab filters to only path nodes. "No path" state explicit. |

Each sub-phase ends with: tests green, manual smoke test on a real repo, commit. Sub-phases are independently shippable; recommended order is 9a → 9b → 9c because both 9b and 9c benefit from utilities (call-graph traversal, fn-level keying) that 9a builds.

---

## File structure (additions)

```
codemap/
├── src/
│   ├── effects.js              # 9a — pure: tagFns(state) -> Map<fnKey, {direct, inherited}>
│   ├── effects-config.js       # 9a — EFFECT_LIBS, EFFECT_PATTERNS, BUILTINS per language
│   ├── smells.js               # 9b — pure: detectSmells(state) -> SmellFinding[]
│   ├── paths.js                # 9c — pure: findPaths(graph, start, end, opts) / findReach(graph, start)
│   └── views/
│       └── smells.js           # 9b — renderSmells(): grouped triage list
└── tests/
    ├── effects.test.js
    ├── smells.test.js
    └── paths.test.js
```

`tests.html` gets three new `await import(...)` lines. Existing files modified (not restructured): `state.js`, `views/trace.js`, `views/functions.js`, `views/graph.js`, `sidebar.js`, `renderer.js`.

---

## Data model additions

```js
// 9a
// STATE.effects: Map<fnKey, { direct: Set<EffectTag>, inherited: Set<EffectTag> }>
// STATE.fileEffects: Map<path, { direct: Set<EffectTag>, inherited: Set<EffectTag> }>  (derived)
// EffectTag = 'net' | 'fs' | 'db' | 'exec' | 'dom' | 'env'
// fnKey = `${file}::${fnName}@${lineNum}` (matches existing convention)

// 9b
// SmellFinding {
//   id: string,         // stable hash of (file, line, kind, snippet) — survives re-parse
//   kind: 'unresolved-call' | 'broken-import' | 'suspicious-comment' | 'empty-catch' | 'placeholder',
//   subkind: string,    // e.g. 'localhost', 'TODO', 'env-stub'
//   severity: 'warn' | 'info',
//   file: string,
//   line: number,       // 1-indexed
//   fnName: string | null,
//   snippet: string,    // ≤80 chars, escaped at render time
//   why: string,        // one-line human-readable explanation
// }
// STATE.smells: SmellFinding[]              (sorted: severity warn-first, then file asc, line asc)
// STATE.smellsByFile: Map<path, SmellFinding[]>   (derived index)

// 9c
// STATE.paint: {
//   kind: 'fn' | 'file' | null,
//   startKey: string | null,
//   endKey: string | null,
//   direction: 'forward' | 'reverse',
// }
// Path { nodes: NodeKey[], edges: [{from, to}], length: number }
```

---

# 9a — Effects

## Detection

Each fn's `direct` tag set is computed from two heuristics, OR'd together.

### 1. Import-derived effects

`effects-config.js` exports per-language lib maps:

```js
export const EFFECT_LIBS = {
  net: {
    js: ['fetch','axios','node-fetch','http','https','undici','got','ky'],
    py: ['requests','urllib','urllib3','httpx','aiohttp'],
    go: ['net/http'], rs: ['reqwest','hyper'], rb: ['net/http','httparty'], java: ['java.net'],
  },
  fs: {
    js: ['fs','fs/promises','path'],
    py: ['pathlib','os.path','shutil'],
    go: ['os','io/ioutil'], rs: ['std::fs'], rb: ['File','FileUtils'], java: ['java.io','java.nio'],
  },
  db: {
    js: ['pg','mysql','mysql2','sqlite3','better-sqlite3','mongodb','mongoose','redis','prisma','typeorm','knex','drizzle-orm'],
    py: ['psycopg2','sqlalchemy','pymongo','redis','sqlite3'],
    go: ['database/sql','gorm.io'], rs: ['sqlx','diesel'], rb: ['pg','mysql2','redis','active_record'], java: ['java.sql','jakarta.persistence'],
  },
  exec: {
    js: ['child_process','execa'], py: ['subprocess','os'], go: ['os/exec'],
    rs: ['std::process'], rb: ['Open3'], java: ['java.lang.Runtime','java.lang.ProcessBuilder'],
  },
  dom: { js: ['react-dom','jquery'] },
  env: { js: ['dotenv'], py: ['dotenv'] },
};
```

If a file imports any matching lib, every fn defined in that file is a *candidate* for that tag. We narrow to fns that actually reference the import's local binding (cheap regex over the fn's body slice). This avoids tagging every fn in a file just because the file's top imports `fs`.

### 2. Call-pattern effects

Some effects fire even without an import (DOM in vanilla JS, `process.env` access, etc.):

```js
export const EFFECT_PATTERNS = {
  dom:  [/\bdocument\.\w+/, /\bwindow\.\w+/, /\bgetElementById\b/, /\bquerySelector\b/, /\binnerHTML\b/],
  env:  [/process\.env\b/, /os\.environ\b/, /std::env::/],
  fs:   [/\bfs\.\w+/, /\bopen\s*\(/, /\bPath\(/],
  net:  [/\bfetch\s*\(/, /\baxios\.\w+/, /\.get\s*\(\s*['"]https?:/],
  exec: [/\bsubprocess\.\w+/, /\bchild_process\.\w+/, /\bos\.system\b/],
};
```

Patterns run against `src.slice(fn.idx, fn.idx + bodyLen)`. Strings and line comments are stripped from the slice first to reduce false positives.

## Propagation

After direct tags are computed for every fn, run reverse-BFS from each tagged fn over `STATE.callsByFn`. Every transitive caller gets the tag in its `inherited` set.

```js
for tag of EFFECTS:
  seeds = sortedFnKeys(fns where direct.has(tag))
  visited = Set()
  queue = [...seeds]
  while queue not empty:
    fn = queue.shift()
    for caller of sortedReverseEdges[fn]:
      if not visited.has(caller):
        visited.add(caller)
        STATE.effects.get(caller).inherited.add(tag)
        queue.push(caller)
```

Cycle-safe via the visited set. Deterministic via sorted seed order and sorted reverse-edge iteration. `O(|edges| × |effects|)` — trivially fast at our scale.

## UI surfaces

- **Trace tab.** Each tree node renders effect badges to the right of the fn name. Direct = solid pill; inherited = outlined pill (1px border, transparent fill). Hovering a badge shows a tooltip with the *shortest seed path* that produced it (e.g. `via handleLogin → saveUser → db.insert`). Color tokens: one hue per effect, defined alongside existing complexity colors in `styles.css`. Inherited badges that derive *only* from low-confidence call edges render with a dashed border instead of solid — exposing heuristic confidence.
- **Functions tab.** New filter chip row above the table: `[ all | net | fs | db | exec | dom | env ]`. Multi-select. New table column shows badges per fn.
- **Sidebar.** Each file row gains a 4px-tall, 6-slot effect strip beneath the path. Each slot is colored if the file has any fn (direct or inherited) with that effect, faded grey otherwise.
- **No new tab.** Effect data piggybacks on existing tabs.

## Edge cases

- **Destructured / renamed imports** — capture the local binding from the `import` statement, match against it in body slices.
- **False positives in comments and string literals** — strip both from the body slice before pattern matching. Order: strings first, then line comments.
- **Recursion** — propagation visited set handles it.
- **Unresolved calls** — propagate through low-confidence edges, but render the resulting inherited badges with a dashed border so the reviewer sees the heuristic's reach.

## Tasks

- [ ] **9a.1** Create `src/effects-config.js` with `EFFECT_LIBS` and `EFFECT_PATTERNS`. Add a `BUILTINS` set per language used later by 9b. Commit.
- [ ] **9a.2** TDD: `tagFns(state)` returns correct direct tags for fixtures covering each effect × each language combo. Specifically test (a) imported-and-used → tagged; (b) imported-but-unused → not tagged; (c) call-pattern without import → tagged; (d) pattern inside string literal → not tagged; (e) pattern inside line comment → not tagged.
- [ ] **9a.3** Implement `tagFns`. Commit.
- [ ] **9a.4** TDD: `propagate(state)` adds inherited tags via reverse-BFS, cycle-safe, deterministic ordering. Snapshot test on a 6-fn fixture.
- [ ] **9a.5** Implement `propagate`. Wire `STATE.effects` and derived `STATE.fileEffects` into the analyze pipeline. Commit.
- [ ] **9a.6** Add effect color tokens to `styles.css`. Modify `views/trace.js` to render solid/outlined/dashed badges per node.
- [ ] **9a.7** Modify `views/functions.js` to add filter chips and badge column.
- [ ] **9a.8** Modify `sidebar.js` to render the 6-slot effect strip beneath each file row.
- [ ] **9a.9** Manual smoke test on a real repo (Codemap itself + one external). Verify badge accuracy on known-effect fns.
- [ ] **9a.10** Append `effects.test.js` to `tests.html`.

### 9a exit criteria

- [ ] All `effects.test.js` tests pass.
- [ ] Trace, Functions, Sidebar render badges deterministically (re-render produces identical DOM).
- [ ] Effect propagation visibly distinguishes direct vs inherited vs low-confidence-inherited.

---

# 9b — Smells

## Detectors

All four run over `STATE` after analysis and effects. Pure functions, deterministic output.

### 1. Unresolved references

Two sub-checks:

- **Unresolved calls** — call sites the analyzer marked `confidence: 'low'` whose name is *not* in: (a) the file's import bindings, (b) the language's `BUILTINS` set, (c) any same-file definition. These are the calls most likely hallucinated.
- **Broken relative imports** — any import where `from` is relative (`./` or `../`) and resolution against `STATE.files` produces no match.

Severity: `warn` for both.

### 2. Suspicious comments

Single regex over comment ranges (per `LANG_CONFIG[ext].comment`):

```js
const SUSPICIOUS = /\b(TODO|FIXME|XXX|HACK|WTF|temporarily|for now|workaround|should never happen|placeholder|stub|fake|dummy|mock(?!\w))\b/i;
```

Each match → finding with file:line, full matching keyword as `subkind`, comment text truncated to 80 chars. Severity: `info` for `TODO`/`FIXME` (common, low alarm), `warn` for the others.

### 3. Empty / swallowed catches

Per-language regex over file source. Ship JS/TS, Python, Go in v1; other languages can be added later by extending the dispatch map.

- **JS/TS:** `/catch\s*(?:\([^)]*\))?\s*\{(\s*|\s*\/\/[^\n]*\s*|\s*return\s+(?:null|undefined)\s*;?\s*|\s*console\.(?:log|error|warn)\([^)]*\)\s*;?\s*)\}/g`
- **Python:** `/except[^\n:]*:\s*(?:pass|return\s+None)\b/g`
- **Go:** `/if\s+err\s*!=\s*nil\s*\{\s*(?:return\s*(?:nil)?\s*|\/\/[^\n]*)\s*\}/g`

Severity: `warn`. `subkind`: `empty | return-null | log-only | err-swallow`.

### 4. Magic placeholders

```js
const PLACEHOLDERS = [
  { kind: 'localhost',  re: /['"`](?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^'"`]*['"`]/g },
  { kind: 'env-stub',   re: /['"`]YOUR_[A-Z_]+['"`]/g },
  { kind: 'lorem',      re: /['"`](?:foo|bar|baz|test123|asdf|xxx)['"`]/gi },
  { kind: 'todo-str',   re: /['"`]TODO[^'"`]*['"`]/g },
  { kind: 'magic-port', re: /\b(?:3000|3001|5000|8000|8080|8888|9000)\b/g },
];
```

Strings stripped of comments before scanning. Severity: `warn` for `localhost`/`env-stub`/`todo-str`/`lorem`; `info` for `magic-port`.

## UI

### Smells tab (new)

```
┌─ Smells ──────────────────────────────────────────────────┐
│  [ all 26 • hallucinated 4 • suspicious 12 •             │
│    swallowed 3 • placeholders 7 ]                        │
│                                                           │
│  ⚠ src/auth.js:42  unresolved-call  validateToken()       │
│      no definition or import found in repo                │
│      fn: handleLogin                          [open file] │
│  ─────────────────────────────────────────────────────── │
│  ⚠ src/db.js:108  empty-catch                             │
│      catch (e) { return null }                            │
│      fn: fetchUser                            [open file] │
│  ─────────────────────────────────────────────────────── │
│  ℹ src/server.js:14  placeholder  localhost               │
│      "http://localhost:3000/api"                          │
│                                              [open file]  │
└───────────────────────────────────────────────────────────┘
```

- Filter chips at top: counts per kind, multi-select.
- Findings sorted by severity (`warn` first), then file asc, then line asc.
- Click `[open file]` → if `fnName` resolvable, switches to Functions tab and selects the fn; otherwise sets `STATE.selectedPath` and shows the file source view at the line.
- Empty state: "No smells detected. Either the code is clean or our heuristics missed something."

### Sidebar smell dot

Each file row gains one dot to the **left** of the existing ext badge:

- red filled — ≥1 `warn` finding in that file
- yellow filled — only `info` findings
- absent — clean

Hover tooltip: `"3 smells (2 warn, 1 info)"`. Click → switches to Smells tab pre-filtered to that file (via a transient filter state, not persistent).

Sidebar row final layout (combining 9a effect strip):
```
[smell] [ext] filename.ext                     [cx]
        ▪net ▪db
```

## Edge cases

- **Findings stability across re-parses** — `id` is a SHA-style content hash of `(file, line, kind, snippet)`. Same finding → same id across drops. Lets Phase 8 annotations later attach to a finding by id without breaking under code drift.
- **Comments inside strings** — strip strings before running comment-regex; strip comments before running placeholder-regex.
- **Builtin allow-list completeness** — seed top ~50 names per language. Tunable post-launch via `effects-config.js`.
- **Magic-port false positives** — common in legitimate code, hence `info` severity.

## Tasks

- [ ] **9b.1** Add `BUILTINS` per language to `effects-config.js`.
- [ ] **9b.2** TDD: each detector independently. Positive case + negative case (e.g. `Math.floor` is *not* unresolved; `// TODO: …` *is* suspicious; `catch (e) { logger.error(e); throw e; }` is *not* swallowed).
- [ ] **9b.3** Implement `detectSmells(state)`. Sort output deterministically.
- [ ] **9b.4** Wire `STATE.smells` and `STATE.smellsByFile` into the analyze pipeline.
- [ ] **9b.5** Implement `views/smells.js` per the mockup. Add filter chips, kind grouping, click-through.
- [ ] **9b.6** Modify `sidebar.js` to render the smell dot left of the ext badge.
- [ ] **9b.7** Add the Smells tab pill to `toolbar.js`.
- [ ] **9b.8** Snapshot test: known fixture → exact expected `SmellFinding[]`.
- [ ] **9b.9** Manual smoke test.
- [ ] **9b.10** Append `smells.test.js` to `tests.html`.

### 9b exit criteria

- [ ] Each detector has positive + negative tests, all passing.
- [ ] Smells tab and sidebar dots render deterministically.
- [ ] Click-through navigates to the right tab/file/line.

---

# 9c — Path painter

## Core (`src/paths.js`)

```js
findPaths(graph, startKey, endKey, opts) -> Path[]
findReach(graph, startKey, opts)         -> Set<NodeKey>
// graph: { nodes: NodeKey[], edges: Map<from, Set<to>> }
// opts:  { maxPaths: 20, maxDepth: 12 }
```

BFS-with-path-reconstruction, capped at `maxPaths=20` and `maxDepth=12`. Returns paths sorted by (length asc, lexicographic node-key tiebreak). Path nodes are simple (no repeats) — cycles are skipped, not traversed.

Two graphs feed it:
- **Fn-level:** `STATE.callsByFn` (already exists from analyzer).
- **File-level:** derive from `STATE.fileImporters` reversed → `fileImports`. Build on demand, cache on STATE.

`paths.js` is graph-agnostic — UI passes the right graph.

## Three modes

1. **Two-endpoint paint** — start + end set. Show every shortest path (up to `maxPaths`).
2. **From-here outward** — start only, no end. Show transitive forward closure (`findReach`). Reverse toggle on the chip flips to "everything that can reach here".
3. **No path** — when `findPaths` returns empty, render the "no path" empty state, not a blank graph.

## Endpoint UX

Right-click on fn (Trace tree, Functions row) or file (Sidebar, Graph node) opens:

```
┌─────────────────────────┐
│  Set as path start      │
│  Set as path end        │
│  Clear path             │
└─────────────────────────┘
```

Persistent **paint chip strip** at the top of Trace and Graph tabs:

```
[● auth.js · handleLogin]  →  [○ set end]   [Reverse ⇄]  [Clear ✕]
```

Endpoints persist across tab switches. Mixing fn-level and file-level isn't supported in v1 — second endpoint set from a different surface produces a toast: "Path painter is in fn mode. Pick another fn, or clear the path to switch."

## Rendering — Graph tab (readability priority)

The user explicitly flagged the graph getting visually crowded. Paint mode therefore *reduces* the visual load relative to default.

Default (no paint): all nodes labeled, edges at default alpha.

Paint mode active:
- **Non-path nodes:** alpha 0.08, **labels removed**, no hit-test (un-hoverable).
- **Non-path edges:** alpha 0.04, 0.5px stroke (vs default 1px).
- **Path nodes:** alpha 1.0, label always shown (force-shown even if normally truncated), 1.5× radius, ring stroke colored by dominant effect (`net`=blue, `db`=violet, `exec`=red, `fs`=orange, `dom`=green, `env`=yellow). Multi-effect nodes get a segmented pie ring.
- **Path edges:** alpha 1.0, 2px stroke, drawn *after* the faded layer. Edges shared by multiple paths render heavier (cap stroke at 3px).
- **Direction arrowhead** at edge midpoint (importer → imported).
- **Endpoints** get a 3px ring and a `START` / `END` label badge.
- **Low-confidence edges** in a path render dashed.

Empty-path state: graph fades to ~10% overall, centered overlay reads:
```
   no path between
   ● handleLogin   →   ● migrateSchema
   they don't reach each other in the call graph
```

## Rendering — Trace tab

- **Two endpoints set:** tree filters to *only path nodes*. Multi-path case shows parallel branches under a synthesized header `3 paths from handleLogin to db.insert`.
- **One endpoint, forward:** tree as today, but greys out leaves with no effect tags — directing the eye to branches that touch reality.
- **One endpoint, reverse:** tree inverted; parents are callers.
- Effect badges (from 9a) remain on every node, so the reviewer sees what each step does.

## Edge cases

- **Cycles** — paths are simple. Cycle reporting is out of scope for v1.
- **Disconnected graph** — `findPaths` returns `[]` → empty-path state.
- **Same node as start and end** — paint shows a single highlighted node with message "start = end".
- **Dense graph hits caps** — chip strip shows "showing 20 of 20+ paths" when `maxPaths` is hit.
- **Performance** — BFS is O(V+E) bounded by caps. <50ms on 500-file/2000-fn repos.

## Tasks

- [ ] **9c.1** TDD: `findPaths` on small fixture graphs — verify ordering, depth cap, multi-path enumeration, empty result.
- [ ] **9c.2** TDD: `findReach` forward and reverse closure on a fixture.
- [ ] **9c.3** Implement `paths.js`. Commit.
- [ ] **9c.4** Add `STATE.paint` and mutator helpers in `state.js`.
- [ ] **9c.5** Add right-click context menu component (reusable across Trace/Functions/Sidebar/Graph).
- [ ] **9c.6** Implement paint chip strip — render in both Trace and Graph tab headers.
- [ ] **9c.7** Modify `views/graph.js`: implement paint-mode rendering (fade, ring colors, dashed low-confidence, empty-path overlay).
- [ ] **9c.8** Modify `views/trace.js`: implement paint-mode tree filtering and reverse-tree rendering.
- [ ] **9c.9** Snapshot test: paint-mode result on a fixture (deterministic path nodes set).
- [ ] **9c.10** Manual smoke test on Codemap itself: paint a path on the Graph tab, verify readability holds.
- [ ] **9c.11** Append `paths.test.js` to `tests.html`.

### 9c exit criteria

- [ ] All `paths.test.js` tests pass.
- [ ] Paint mode renders deterministically; toggling clear restores the default view exactly.
- [ ] Graph in paint mode is *less* visually noisy than default (manual judgment, recorded in PR description).
- [ ] No-path case renders the explicit empty state, not a blank graph.

---

# Section 5 — Testing strategy summary

| Layer | Test type | Examples |
|---|---|---|
| `effects.js` | Unit | per effect × per language: imported-and-used, imported-but-unused, pattern-without-import, pattern-in-string-literal, pattern-in-comment |
| `effects.js` | Snapshot | propagation result on 6-fn fixture with cycles |
| `smells.js` | Unit | per detector: positive case + negative case for each `subkind`. Builtin allow-list (`Math.floor`, `print`, `len` not flagged) |
| `smells.js` | Snapshot | full `detectSmells(state)` on fixture repo with hand-counted findings |
| `paths.js` | Unit | known small graphs: shortest path, multi-path, depth cap, no-path, cycles ignored |
| `paths.js` | Snapshot | paint result on fixture (start, end, expected node set) |
| Integration | Manual smoke | each sub-phase on Codemap repo + one external repo |
| Determinism | Implicit | every snapshot test re-runs and must produce identical output |

All tests run in the existing browser harness via `tests.html`. No Node, no npm.

**Performance budgets** (validated in Phase 7-style pass after 9c lands):
- Effect tagging + propagation: <100ms on 500-file repo.
- Smell scan: <200ms on 500-file repo.
- Path-find: <50ms per query on 2000-fn graph.

# Section 6 — Non-goals, risks, deferred

## Explicit non-goals

- **No LLM, no server, no AST.** Same hard constraints as the rest of Codemap.
- **No near-duplicate fn detection.** Considered for Smells; cut from v1 because the false-positive rate without tuning is high. Revisit when we have real-world finding-feedback data.
- **No style-inconsistency report.** Same reasoning. Defer.
- **No cycle reporting in path painter.** Paths are simple. Cycle detection is a different feature with its own UI surface.
- **No mixed-mode paint (fn + file endpoints in one session).** Forces a clean mental model; cheap to lift later if real users want it.
- **No annotation integration with smells in v1.** Phase 8 will be able to attach annotations to findings via `SmellFinding.id`, but the wiring lives in Phase 8 — this phase only commits to making the id stable.

## Risks

- **False-positive rate on unresolved-call detector.** Mitigation: builtin allow-list per language, plus the existing call-graph confidence flag (we only flag `confidence: 'low'` calls). Manual smoke on real repos will validate the rate before ship; if >5 noise findings per 100 calls on a clean repo, tighten the rule before merging.
- **Effect propagation through ambiguous call edges over-tagging fns.** Mitigation: dashed-border rendering for purely-low-confidence-derived inherited tags. The reviewer sees the heuristic's reach.
- **Graph paint mode visually crowded despite the fade strategy.** Mitigation: aggressive fade values (alpha 0.08 / 0.04) + label removal on non-path nodes. If still crowded after smoke test, tighten further. Exit criterion explicitly requires the painted graph to be *less* noisy than default.
- **Right-click menu conflicts with browser context menu.** Standard pattern: `preventDefault()` on the captured event; users can hold Shift to get the native menu back.
- **Empty-catch regex misses real cases or fires on fine ones.** Per-language complexity is high. Mitigation: ship JS/TS/Python/Go in v1, expand later. Each language regex tested with 3+ positive and 3+ negative cases.

## Deferred follow-ups

- Near-duplicate fn detector (Smells v2).
- Style-inconsistency report (Smells v2).
- Unused-export detector (likely belongs with Phase 8 risk work, not Smells).
- Cycle detection visualization (its own mini-feature).
- Effect-effect link in Smells: e.g. flag fns that *only* touch `exec` with no surrounding error handling. Composite findings.
- Annotation-on-finding wiring (Phase 8 owns this).

---

## Cross-cutting reminders (read before each sub-phase)

- No build step. Modules load directly.
- No CDN for parsing/analysis logic.
- No npm, no `package.json`, no installs.
- Each new `*.test.js` appended to `tests.html` import list.
- Every `render*` function: idempotent, reads only from `STATE`.
- Every regex: paired with at least one positive test and one negative/keyword test.
- All escaping at render time (`textContent` or `escape()`); never raw user data through `innerHTML`.
- Frequent commits — each task ends with a commit.
