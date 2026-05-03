# Phase 8 — History & Memory

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Codemap from a *snapshot* tool ("what does this code look like right now?") to a *maintenance* tool ("what has changed, what is rotting, what do I know about it?"). Three additions, all client-side, all deterministic, no LLM:

1. **Snapshot diff** — persist parsed state, compare a re-drop against the previous one, surface drift.
2. **Annotations** — attach durable notes to files and functions; export/import as JSON so teams can share.
3. **Git-aware risk** — when a `git log` export is dropped alongside the repo, attach churn/recency/authors per file and compute a `risk = complexity × churn` hotspot score.

**Non-goals:** no server, no LLM, no `.git/objects` parsing (too slow in browser at repo scale — we ingest a plaintext `git log` export instead). No backwards-compat shims for snapshots produced by older builds; the schema is versioned and a mismatch shows a clear "regenerate" message.

**Architecture fit:** all three additions are pure-data layers on top of the existing `STATE`. Rendering is additive — new tab (**History**), new Overview card (**Hotspots**), new sidebar/trace decorations (annotation dots, churn bars). No existing module changes shape; new modules slot into the existing pattern.

---

## Phases at a glance

| Sub-phase | Deliverable | Demo-able outcome |
|---|---|---|
| 8a | Snapshot persistence + diff | Drop repo → "Save snapshot". Re-drop later → diff view: added/removed files, fn count drift, complexity drift, new/dropped external deps. |
| 8b | Annotations | Right-click any file or fn → attach note. Notes survive page reload via `localStorage`, are exportable/importable as JSON, surface as dots in sidebar/trace and as a chip strip in the detail panes. |
| 8c | Git history ingestion + hotspots | Drop a `git log --numstat --pretty=format:...` text file. Per-file churn/lastTouched/authors attach to `STATE`. New `risk` score; new Overview "Hotspots" card; new sort option in Functions tab. |

Each sub-phase ends with: tests green, manual smoke test on a real repo, commit. Sub-phases are independently shippable — order is recommended but not required.

---

## File structure (additions)

```
codemap/
├── src/
│   ├── snapshot.js            # serialize(STATE) / deserialize / diff(prev, curr)
│   ├── annotations.js         # CRUD + localStorage persistence + JSON import/export
│   ├── git-log.js             # parseGitLog(text) -> {byPath: {file: {commits, lastTouched, authors[]}}}
│   ├── risk.js                # mergeGitStats + computeRisk(file)
│   └── views/
│       ├── history.js         # renderHistory(): snapshot list, diff render, save/load buttons
│       └── hotspots-card.js   # renderHotspotsCard(): top-N risk list (slots into Overview)
└── tests/
    ├── snapshot.test.js
    ├── annotations.test.js
    ├── git-log.test.js
    └── risk.test.js
```

`tests.html` gets four new `await import(...)` lines. No other existing files are renamed or restructured.

---

## Data model additions

```js
// Snapshot — what we serialize to localStorage / JSON export
{
  schemaVersion: 1,
  capturedAt: number,           // Date.now()
  label: string,                // user-supplied or auto "2026-05-03 14:22"
  fileCount: number,
  totalLines: number,
  files: [
    {
      path: string,
      lang: string,
      lineCount: number,
      fnCount: number,
      cx: number,
      imports: string[],        // libs only, sorted
      fnNames: string[],        // sorted; full fn objects intentionally dropped to keep snapshots small
    },
  ],
}

// SnapshotDiff
{
  prevLabel: string,
  currLabel: string,
  added:    [{ path, lang, lineCount, fnCount }],
  removed:  [{ path, lang, lineCount, fnCount }],
  changed:  [{
    path,
    lineDelta: number,          // curr - prev
    fnDelta: number,
    cxDelta: number,            // curr - prev, signed
    importsAdded: string[],
    importsRemoved: string[],
  }],
  depsAdded: string[],          // repo-wide new imports
  depsRemoved: string[],
}

// Annotation
{
  id: string,                   // crypto.randomUUID()
  target: { kind: 'file'|'fn', path: string, fnName?: string },
  text: string,                 // <= 2000 chars, plaintext
  tags: string[],               // ['owner:alice', 'deprecated', ...] — free-form
  createdAt: number,
  updatedAt: number,
}

// GitStats (per file)
{
  commits: number,              // count of commits touching this file
  lastTouched: number,          // unix seconds, max commit timestamp
  authors: string[],            // sorted, deduped emails or names
  linesAdded: number,           // lifetime sum from numstat
  linesRemoved: number,
}

// Risk score (derived, not stored)
//   risk = clamp((cx / 10) * Math.log10(commits + 1), 0, 10)
//   recency boost: × (1 + max(0, 1 - daysSinceLastTouch / 90))
```

`STATE` gains:
```js
STATE.snapshots         = [];   // Snapshot[] — most recent last
STATE.annotations       = [];   // Annotation[]
STATE.gitStatsByPath    = {};   // path -> GitStats
STATE.gitLogIngestedAt  = null; // number|null
```

All four fields default-initialize, are independently optional, and rendering must never assume any of them is non-empty.

---

# PHASE 8a — Snapshot persistence + diff

**Goal:** A user drops a repo, clicks **Save snapshot**, comes back a week later, drops the (modified) repo, and sees a clear diff against the prior snapshot.

### Task 8a.1 — `src/snapshot.js` pure functions

**Files:**
- Create: `src/snapshot.js`
- Create: `tests/snapshot.test.js`

- [ ] **Step 1: TDD `serialize(state)`** — given a fixed 3-file `STATE.files`, returns the exact `Snapshot` shape above with `schemaVersion: 1`, `files` sorted by path, `imports`/`fnNames` sorted.
- [ ] **Step 2: Implement `serialize`** purely — no DOM, no `Date.now()` inline (accept `now` arg with default).
- [ ] **Step 3: TDD `deserialize(json)`** — round-trips `serialize` output; rejects mismatched `schemaVersion` with a clear `Error('snapshot schema v2 not supported, expected v1')`.
- [ ] **Step 4: TDD `diff(prev, curr)`** for the three classes (added / removed / changed) plus repo-wide `depsAdded`/`depsRemoved`. Snapshot test on a 4-file fixture.
- [ ] **Step 5: Implement `diff`**. Files match by `path`. A file with `lineDelta === 0 && fnDelta === 0 && cxDelta === 0 && importsAdded.length === 0 && importsRemoved.length === 0` is omitted from `changed`.
- [ ] **Step 6: Commit** `feat(snapshot): pure serialize/deserialize/diff with tests`.

### Task 8a.2 — Persistence layer

- [ ] **Step 1:** `loadSnapshots()` reads `localStorage['codemap.snapshots']`, returns `Snapshot[]`. Quota-exceeded or parse-error returns `[]` and logs to console — never throws.
- [ ] **Step 2:** `saveSnapshot(snap)` appends, caps at 10 most recent (drops oldest), writes back. If the serialized JSON exceeds 4MB total, drop oldest until under limit and warn in console.
- [ ] **Step 3:** `deleteSnapshot(capturedAt)` removes by timestamp.
- [ ] **Step 4:** Tests use a fake `storage` object injected into the module (don't reach into real `localStorage` from tests).
- [ ] **Step 5:** Commit.

### Task 8a.3 — `History` tab UI

**Files:**
- Create: `src/views/history.js`
- Modify: `src/toolbar.js` (add `History` pill), `src/state.js` (`activeTab` accepts `'history'`), `src/renderer.js` (dispatch).

- [ ] **Step 1:** Toolbar pill `History` between `Libraries` and the project badge. Disabled (greyed, no click) when `STATE.snapshots.length === 0` *and* `STATE.files.length === 0`.
- [ ] **Step 2:** `renderHistory()` body, two regions:
  - **Snapshots list** (left, 240px): each row = `label · N files · captured Xd ago`. Buttons: **Save current** (top), **Diff against current** (per row when current state exists), **Export JSON**, **Delete**.
  - **Diff panel** (right, flex): on diff click, render three collapsible groups: *Added (N)* / *Removed (N)* / *Changed (N)*. Within Changed, sub-cards per file showing deltas with sign + color (green negative cx delta = improvement, red positive = regression). Bottom strip: *Dependencies added/removed* as chip rows.
- [ ] **Step 3:** **Import JSON**: file input accepts a previously-exported snapshot, validates with `deserialize`, appends to `STATE.snapshots`. Surface clear error for schema-mismatch.
- [ ] **Step 4:** Empty state: when no snapshots exist, render the upload-splash idiom from design.md with "Drop a folder, then Save snapshot to start tracking drift."
- [ ] **Step 5:** Manual smoke: drop a repo, save, edit one file outside the browser, re-drop, diff. Verify counts.
- [ ] **Step 6:** Escape audit on every dynamic string in the new view.
- [ ] **Step 7:** Commit `feat(history): tab with snapshot save/load/diff`.

### Phase 8a exit criteria
- [ ] Snapshot save/load round-trips losslessly across page reloads.
- [ ] Diff is deterministic: running it twice on the same inputs produces identical DOM (snapshot test or manual `outerHTML` comparison).
- [ ] No console errors on empty state, single-snapshot state, or schema-mismatched import.
- [ ] All `snapshot.test.js` cases pass.

---

# PHASE 8b — Annotations

**Goal:** Capture institutional knowledge directly on files and functions; persist locally; export to share.

### Task 8b.1 — `src/annotations.js` CRUD

**Files:**
- Create: `src/annotations.js`
- Create: `tests/annotations.test.js`

- [ ] **Step 1:** TDD `addAnnotation({target, text, tags})` — generates id, sets timestamps, returns the new record.
- [ ] **Step 2:** TDD `updateAnnotation(id, patch)` — only `text`/`tags` mutable; `updatedAt` bumps; throws on unknown id.
- [ ] **Step 3:** TDD `deleteAnnotation(id)` — idempotent.
- [ ] **Step 4:** TDD `findAnnotations({path, fnName})` — returns matching annotations sorted by `updatedAt desc`.
- [ ] **Step 5:** Persistence to `localStorage['codemap.annotations']` with the same fake-storage injection pattern as 8a.
- [ ] **Step 6:** Tag parsing: tags are split on whitespace from the input; `owner:alice` and `deprecated` are stored verbatim. No special semantics in this phase — they're just searchable strings.
- [ ] **Step 7:** Commit.

### Task 8b.2 — UI affordances

**Files modified:**
- `src/sidebar.js` — show a small dot (var(--accent), 4px) next to file names that have annotations.
- `src/views/functions.js` — same dot in the fn row.
- `src/views/trace.js` — dot on tree nodes; if root fn has annotations, render the chip strip above the detail body.
- New: `src/annotation-popover.js` — a small popover (positioned absolutely) with textarea + tag input + Save/Delete buttons.

- [ ] **Step 1:** Right-click on a file row in sidebar → popover with current annotations stacked (newest first) + an "Add note" empty row. Esc closes; click-outside closes; Cmd/Ctrl+Enter saves.
- [ ] **Step 2:** Same popover wired up on Functions rows and Trace nodes.
- [ ] **Step 3:** Detail panes (Functions selected fn, Trace detail) show annotations as a stacked list above the existing content, each with relative-time stamp ("3d ago") and tag pills.
- [ ] **Step 4:** Sidebar dots refresh on every `renderAll()` (idempotent — read from `STATE.annotations` only).
- [ ] **Step 5:** Keyboard: `n` while a sidebar item is focused opens the popover; `Esc` closes.
- [ ] **Step 6:** Escape audit — annotation `text` is user-controlled and must use `textContent`, never `innerHTML`. Tags too.
- [ ] **Step 7:** Manual smoke: add three annotations, reload page, verify they survive.
- [ ] **Step 8:** Commit.

### Task 8b.3 — Export / import

- [ ] **Step 1:** History tab gains an **Annotations** strip (above snapshots): *Export annotations* (download JSON) / *Import annotations* (file picker, validate shape, merge by id — incoming wins on conflict).
- [ ] **Step 2:** Test the merge logic: same-id incoming replaces; new id appends; malformed entries are skipped with a count surfaced in a toast.
- [ ] **Step 3:** Commit.

### Phase 8b exit criteria
- [ ] Annotations survive a hard reload.
- [ ] Sidebar/Functions/Trace all show the dot for annotated targets.
- [ ] Right-click → popover → save → dot appears without a full re-render flicker (just a `renderAll()` is fine; idempotency carries this).
- [ ] No XSS path: an annotation with `<script>alert(1)</script>` text renders as plain text.
- [ ] All `annotations.test.js` cases pass.

---

# PHASE 8c — Git history ingestion + hotspots

**Goal:** When the user drops (or picks) a `git log` export alongside the repo, attach churn/recency/authors to every file. Surface `risk = complexity × churn` as the headline maintenance signal.

**Why a text export, not `.git`:** browsers can technically walk a `.git` directory via the drop API, but parsing pack files, deltas, and blobs in JavaScript at repo scale would blow our perf targets and pull us toward a non-trivial dependency. A plaintext `git log` is one shell command, ~10–50KB per 1000 commits, parses in milliseconds, and stays honest to the zero-dep philosophy.

The exact command we document:

```sh
git log --numstat --pretty=format:'__commit__%n%H%n%aI%n%ae%n%s' > codemap-history.txt
```

### Task 8c.1 — `src/git-log.js` parser

**Files:**
- Create: `src/git-log.js`
- Create: `tests/git-log.test.js`

- [ ] **Step 1:** TDD `parseGitLog(text)` returns `{ commits: Commit[], byPath: {[path]: GitStats} }`. Use a fixture string with 3 commits touching 4 files; assert exact byPath shape.
- [ ] **Step 2:** Edge cases tested: binary-file numstat (`-\t-\tpath`) counted as 1 commit but 0 lines; renamed files (`old => new` syntax) attribute to the *new* path; UTF-8 author names; empty commit (merge with no numstat block) skipped without error.
- [ ] **Step 3:** Performance: parsing a 1MB log (~30k commits) completes in <300ms. Add a `?perf=1`-gated checkpoint.
- [ ] **Step 4:** Commit.

### Task 8c.2 — Ingestion wiring

**Files modified:**
- `src/ingest.js` — when a dropped file is named `*.git-log` / `codemap-history.txt` / has the magic first line `__commit__`, route to `parseGitLog` instead of the source-file pipeline.
- `src/state.js` — add `gitStatsByPath`, `gitLogIngestedAt`.
- `src/toolbar.js` — when `gitLogIngestedAt` is set, show a small "🜨 history loaded" pill (text only, no emoji per house style — use the text "history loaded").

- [ ] **Step 1:** Drop detection: if any item's text starts with `__commit__\n`, treat it as a git log; do not try to parse it as source.
- [ ] **Step 2:** Manual import button in History tab as a fallback for browsers that resist text-file drops.
- [ ] **Step 3:** Manual smoke on this very repo: `git log --numstat ... > codemap-history.txt`, drop alongside `CodeMap/`, confirm `STATE.gitStatsByPath` populates.
- [ ] **Step 4:** Commit.

### Task 8c.3 — `src/risk.js` + Hotspots card

**Files:**
- Create: `src/risk.js`
- Create: `tests/risk.test.js`
- Create: `src/views/hotspots-card.js`
- Modify: `src/views/overview.js` to slot the card in when git stats exist.
- Modify: `src/views/functions.js` — new sort option `Risk ↓` (only enabled when git stats exist).

- [ ] **Step 1:** TDD `computeRisk(file, gitStats, now)`:
  ```
  base = (file.cx / 10) * Math.log10(stats.commits + 1)
  daysSince = (now - stats.lastTouched*1000) / 86_400_000
  recency = 1 + Math.max(0, 1 - daysSince / 90)
  risk = clamp(base * recency, 0, 10)
  ```
  Tests cover: zero commits → 0 risk; high cx low churn → moderate; high cx high churn recently → near 10.
- [ ] **Step 2:** Snapshot test of `topHotspots(state, n=10)` on a fixed fixture.
- [ ] **Step 3:** Hotspots card: top 10 files, each row = `path · risk N.N · cx N · N commits · last Xd ago`. Bar fill width ∝ risk/10, color from `--success`/`--warn`/`--danger` thresholds.
- [ ] **Step 4:** Functions tab: when git stats exist, fn rows show a thin churn bar under the cx badge (proportional to *file* commits, not fn commits — we can't attribute commits to functions deterministically without AST). Tooltip explains the limitation.
- [ ] **Step 5:** Sidebar: optional churn-tint stripe on the right edge of each file row, opt-in via a toggle in History tab ("Tint sidebar by churn"). Default off (avoids visual overload for users not using this feature).
- [ ] **Step 6:** Manual smoke on a real repo with at least 100 commits.
- [ ] **Step 7:** Commit.

### Phase 8c exit criteria
- [ ] Without a git log dropped, **nothing in the UI changes** — the feature is fully opt-in.
- [ ] With a git log dropped, the Hotspots card appears in Overview and Functions gains the Risk sort.
- [ ] Risk score is deterministic given a frozen `now` argument.
- [ ] All `git-log.test.js` and `risk.test.js` cases pass.
- [ ] Parsing a 1MB git log stays under 300ms.

---

## Cross-cutting reminders (read before each sub-phase)

- No build step. No npm. No CDN for parsing logic. Same as every prior phase.
- Every new module is pure where possible; DOM-touching functions remain `render*` and idempotent.
- Every new `*.test.js` file is appended to the import list in `tests.html` before `report()`.
- All user-controlled strings (annotation text, snapshot labels, git author names, commit subjects) go through `textContent` or are escaped before reaching `innerHTML`.
- `localStorage` access is wrapped (try/catch, fake-storage injection in tests). Never let a quota or parse error crash the app — degrade to in-memory.
- New features are *additive*: `STATE.snapshots`, `STATE.annotations`, `STATE.gitStatsByPath` all default to empty/null and every existing render path tolerates that.

---

## Open questions for the user before execution

1. **Annotation scope:** is per-line annotation valuable, or are file/function granularities enough for v1? (Plan currently says file/function only.)
2. **Snapshot storage cap:** 10 snapshots / 4MB total feels right for `localStorage`. Should we also offer IndexedDB for users who want more? (Plan currently says no — defer to a later phase.)
3. **Git log format:** do we want to also accept `git log --format=...` *without* `--numstat` (loses line counts but still gives churn)? Plan currently requires numstat for simplicity.

These don't block drafting the plan but should be answered before 8b/8c implementation starts.
