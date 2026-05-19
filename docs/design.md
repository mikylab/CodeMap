# Codemap — UI Design Specification
> Hand this file to Claude Code alongside CLAUDE.md.
> This spec describes the visual and interaction language of the UI so it can
> be reproduced and extended consistently. Where it gives exact values they are
> taken from `styles.css`; behavioral sections describe intent and point at the
> implementing module. The app is the **v3 single-workspace UI** — there are no
> tabs.

---

## Aesthetic direction

**Industrial / utilitarian monospace dashboard.**
Think IDE + terminal + instrument panel. Every element should feel like it was built by an engineer for engineers — precise, dense, functional, zero decoration for its own sake.

- All labels, values, and UI chrome use **IBM Plex Mono** (monospace). This is non-negotiable — it defines the entire character of the UI.
- Body copy / prose descriptions (walk step content, full-screen titles) use **IBM Plex Sans**.
- The palette is deliberately restrained: near-black/white surfaces, a single blue accent, semantic colors only for meaning (green = healthy, amber = warn, red = danger).
- No gradients. Shadows only in the few places listed at the end. No rounded corners larger than 12px. No decorative elements.
- Border weight: **0.5px** for internal dividers/panel edges; 1px for interactive controls (buttons, chips, inputs). The thinness on dividers is intentional and creates a precision-instrument feel.
- The overall effect should feel like a professional CLI tool that grew a UI — not a SaaS product that grew a terminal.

---

## Fonts

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap');

--font-mono: 'IBM Plex Mono', ui-monospace, monospace;
--font-sans: 'IBM Plex Sans', system-ui, sans-serif;
```

**Usage rules:**
- `IBM Plex Mono` — all metadata, labels, counts, file names, function names, code values, stat numbers, badges, buttons, navigator items, bar chart labels
- `IBM Plex Sans` — prose only: walk step body, walk step titles, full-screen overlay titles (`fs-title-text`), help/modal titles
- Weights in use: **400** (body, metadata), **500** (most labels, buttons, stat values, mode buttons), **600** (the logo wordmark, the smell badge, the help glyph, help section titles). The webfont import currently loads 400 and 500; 600 is rendered by the browser for those few accents.
- **Never use Inter, Roboto, system-ui, or Arial for data.** Sans is for prose only.

---

## Color tokens

All colors are CSS variables on `:root`. Surfaces adapt to light/dark via `prefers-color-scheme`.

```css
:root {
  --bg:    #ffffff;   /* primary surface */
  --bg2:   #f6f6f4;   /* toolbar, navigator, statbar background, cards-on-bg2 */
  --bg3:   #ebeae5;   /* hover states, pill backgrounds, count chips */
  --text:  #2a2a28;   /* full-opacity text */
  --muted: #78766f;   /* ~secondary — labels, metadata, subtitles */
  --border:  rgba(60, 58, 50, 0.15);  /* dividers inside sections */
  --border2: rgba(60, 58, 50, 0.30);  /* panel edges, control outlines */

  --accent:  #3B8BD4;   /* blue   — selection, active state, info */
  --success: #1D9E75;   /* green  — healthy, low complexity, callers, in-edges */
  --warn:    #BA7517;   /* amber  — medium complexity, info smells */
  --danger:  #E24B4A;   /* red    — high complexity, warn smells, errors */
  --purple:  #7F77DD;   /* purple — med-confidence calls, config/schema */
  --teal:    #5DCAA5;   /* teal   — deps */
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg:  #1c1b18;  --bg2: #232220;  --bg3: #2c2b28;
    --text: #e6e4dc; --muted: #a09e94;
    --border:  rgba(220, 218, 208, 0.12);
    --border2: rgba(220, 218, 208, 0.22);
  }
}
```

**Complexity color rule** (used everywhere complexity is displayed):
```
cx < 5  → --success (#1D9E75)
cx 5–7  → --warn    (#BA7517)
cx >= 8 → --danger  (#E24B4A)
```

**Complexity badge** (colored background chip — `.cx-low/.cx-mid/.cx-high`; foreground-only variants `.cx-low-fg/.cx-mid-fg/.cx-high-fg`):
```css
/* Light mode */
.cx-low  { background: #E1F5EE; color: #0F6E56; }
.cx-mid  { background: #FAEEDA; color: #854F0B; }
.cx-high { background: #FCEBEB; color: #A32D2D; }

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .cx-low  { background: #085041; color: #9FE1CB; }
  .cx-mid  { background: #633806; color: #FAC775; }
  .cx-high { background: #501313; color: #F7C1C1; }
}
```

**Language colors** (file ext badges, bar fills, graph nodes) — defined per entry in `src/lang-config.js`:
```
Python     #3B8BD4   JavaScript #EF9F27   TypeScript #185FA5
JSX/TSX    #EF9F27 / #185FA5               Rust       #D85A30
Go         #5DCAA5   Java       #E85D24    Ruby       #E24B4A
```

**Effect colors** (side-effect badges & chips) — see *Effects badges* below:
```
net  #4d8df0   fs  #e08a3c   db   #a874e0
exec #e0584d   dom #4dbf7a   env  #c8a93a
```

---

## Spacing system

Use the established values; don't invent new ones.

```
2px   internal padding for tiny badges/pills
3–4px gap between inline chips / chart rows
6px   padding inside badges; gap between mode buttons
8px   internal card padding; gap between toolbar logo elements
10px  statbar cell vertical padding; toolbar vertical padding
12px  panel content padding; grid gaps; project/smell badge horizontal padding
14px  navigator item horizontal padding; standard panel horizontal padding; statbar cell horizontal padding
16px  walk indentation unit; toolbar gap; fs-head gap
20px  toolbar horizontal padding
24px  fs-head / help-card horizontal padding
32px  help-panel backdrop padding; empty-state padding
```

**Border radius:**
- `3px` — mono badges, effect badges, count chips
- `4px` — small pills, ext badges, inputs, fx chips, drop overlay
- `6px` — logo button, project badge, smell badge, fs-close, mode/help controls
- `8px` — `var(--border-radius-md)` — cards, drop/url buttons, mode buttons
- `12px` — walk cards, help/modal cards
- `50%` — help glyph button, progress/trace dots

---

## Page structure

The app is a fixed-height column: a toolbar over a two-pane layout. Full-screen
work (Walk / Graph / Smells) and the help/URL modals overlay everything.

```
┌──────────────────────────────────────────────────────────────────────┐
│  TOOLBAR  (64px tall, --bg2)                                           │
│  logo · [Walk][Graph] · ⟶spacer⟵ · fx-chips · ⚠badge · proj · ? · URL · Drop │
├───────────────┬────────────────────────────────────────────────────────┤
│               │  STATBAR  (5 cells)                                     │
│  NAVIGATOR    │  WARNBAR  (hidden unless skips / repo load notice)      │
│  (240px wide) ├────────────────────────────────────────────────────────┤
│  search-first │  WORKSPACE  (detail pane — depends on selection)        │
│  file/fn tree │                                                         │
└───────────────┴────────────────────────────────────────────────────────┘
   FULLSCREEN overlay (Walk / Graph / Smells) sits at inset 64px 0 0 0, z-index 100
   HELP panel + GIT-URL modal are centered backdrops, z-index 200
   DROP overlay covers the main pane on dragenter, z-index 10
```

```css
.root   { display: flex; flex-direction: column; height: 100%; }
.layout { display: grid; grid-template-columns: 240px 1fr; flex: 1; min-height: 0; }
.main   { display: flex; flex-direction: column; overflow: hidden; min-width: 0; position: relative; }
```

DOM skeleton (`index.html`): `#toolbar`, `.layout` → `#navigator` + `.main`
(`#statbar`, `#warnbar`, `#workspace`, `#drop-overlay`), then `#fullscreen` and
`#help-panel` siblings. All rendering flows through `renderAll()` in
`src/renderer.js`, which reads only from `STATE`.

---

## Toolbar

Height **64px**, padding `10px 20px`, `gap: 14px`, background `--bg2`, bottom
border `0.5px solid var(--border2)`. Rendered by `src/toolbar.js`. Effect chips
and the smell badge only appear once a project is loaded.

**Left to right:**

1. **Logo** (`.tb-logo`) — a 22px SVG node-graph glyph (four dots + crossing
   lines, `currentColor` = `--accent`) then `codemap` (mono **600** 17px
   `--text`) and `v3` (mono 400 12px `--muted`). The whole logo is a button:
   click clears selection, exits any overlay, closes help — i.e. "back to repo
   overview."
2. **Mode buttons** (`.tb-modes` → `.tb-mode`) — `🗺  Walk` and `◉  Graph`.
   Mono 13px 500, padding `9px 16px`, radius 8px, `1px solid var(--border2)`,
   bg `--bg`. Hover → accent border/text. `.active` (overlay open) → accent
   background, white text, `box-shadow: 0 1px 3px rgba(0,0,0,.10)`. Disabled
   (no project) → `opacity .4`.
3. **Spacer** (`.tb-spacer`, `flex: 1`).
4. **Effect chips** (`.tb-fx-chips` → `.tb-fx-chip`) — six chips
   `net fs db exec dom env`, flanked by `0.5px` left/right borders. Mono 10px
   500, uppercase, padding `4px 8px`, radius 4px, `1px solid var(--border2)`,
   `--muted`. When toggled `.on` they **invert** (`background: var(--text); color: var(--bg)`)
   — they are filters, so they use the neutral inverted treatment, not the
   per-effect colors. Clicking toggles `STATE.fnEffectFilter`.
5. **Smell badge** (`.tb-smell-badge`) — `⚠ N` when there are findings, else
   `✓ clean`. Mono 12px 600, padding `6px 12px`, radius 6px. `.warn` (≥1 warn)
   → danger border/text; `.info` (info-only) → warn; `.none` → success. When
   the Smells overlay is open it fills (`.active` → colored bg, white text).
   Hover nudges up 1px.
6. **Project badge** (`.tb-project`) — mono 12px `--muted`, `0.5px` border,
   bg `--bg`, radius 6px, padding `6px 12px`. Shows `"{N} files"` or `"no project"`.
7. **Help button** (`.tb-help`) — a 30×30 circular `?` (mono 14px 600). Hover →
   accent; `.active` (panel open) → accent fill, white.
8. **URL button** (`.tb-url`) — `Load URL`. Mono 13px 500, `1px solid var(--border2)`,
   radius 8px, padding `9px 14px`. Opens the git-URL modal.
9. **Drop button** (`.tb-drop`) — `Drop repo / files`. Mono 13px 500, `--accent`
   text, `1px solid var(--accent)`, radius 8px, padding `9px 18px`. Hover →
   accent fill, white. Opens the directory picker.

---

## Navigator (left pane)

Width 240px, background `--bg2`, right border `0.5px solid var(--border2)`,
column flex, `overflow: hidden`. Rendered by `src/navigator.js`. It is a
**search-first unified tree**, not a flat file list.

- **Section head** (`.sb-head`) — mono 10px 500 uppercase `--muted`, padding
  `10px 14px 6px`, with a `.sb-count` chip (bg `--bg3`, radius 3px, 9px) for the
  file count.
- **Home row** (`⌂ Repo`) clears the selection and returns the workspace to the
  repo overview.
- **Filter input** (`.sb-filter input`) — full width, mono 11px, padding `4px 8px`,
  radius 4px, `0.5px` border. Typing flips the tree into flat
  `file › function` results matching anywhere in the repo; focus border = accent.
- **Tree** (`.sb-list`) — directories (`.dir-item` with twirl + count) and files.
  Selecting a file expands its functions inline (`.sb-fn`).

**File row** (`.file-item`) — padding `5px 14px`, `gap: 7px`,
`border-left: 2px solid transparent`; hover → `--bg3`; `.active` → `--bg3` +
accent left-border + accent text. Anatomy:
1. **Ext badge** (`.ext-badge`) — 2–3 char ext, 9px 500, bg `{langColor}` at low
   alpha, color `{langColor}`, radius 2px.
2. **File name** (`.file-name`) — 11px, ellipsis, `flex: 1`, full path in `title`.
3. **Smell dot** — red if the file has ≥1 warn finding, yellow if info-only.
4. **Complexity** (`.file-cx`) — 9px 500, colored by the complexity rule.

---

## Stat bar

Five equal cells (`.statbar` → `.stat-cell`, `flex: 1`, padding `10px 14px`,
right border `0.5px solid var(--border)`; `.last` drops the border). Background
`--bg`.

```css
.stat-lbl { font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.07em; }
.stat-val { font-size: 18px; font-weight: 500; line-height: 1; }
.stat-sub { font-size: 10px; color: var(--muted); }   /* ellipsised */
```

Cells (label → value → sub): `Lines` → total (`toLocaleString`) → `"across N files"` ·
`Functions` → count → `"avg N lines each"` · `Libraries` → unique imports →
`"N unused"` · `Complexity` → avg cyclomatic (1 dp, colored) → `"avg cyclomatic"` ·
`Languages` → distinct count → comma-joined names.

## Warning bar

`#warnbar` (`.warnbar`) sits between statbar and workspace, `hidden` by default.
Mono 11px, `--warn`, padding `6px 14px`, bg `--bg2`. Shows a repo-load notice
(`Loaded github.com/owner/repo@ref — fetched/total files`) and/or a skipped-files
notice (`Skipped N files > 2MB — e.g. …`), joined with ` · `.

---

## Workspace (detail pane)

The right pane (`#workspace`) is dispatched by `src/views/workspace.js`. What it
shows depends on the current selection in `STATE`; **mode chips are sticky**
(picking *Source* on one item keeps you on Source as you move to siblings).

- **Nothing selected** (`⌂ Repo`) → the **repo overview** (below), with Risk and
  Deps modes for repo-wide smells and the library breakdown.
- **A file selected** → modes: *Summary* (effects, top functions by complexity,
  smells, importers), *Source*, *Calls* (pick a function), *Risk*, *Deps*.
- **A function selected** → modes: *Summary* (callers, callees, smells, source
  preview), *Source*, *Calls* (full execution-map DAG), *Risk*.

### Repo overview

2-column card grid (`.ov-grid`, `grid-template-columns: 1fr 1fr`, `gap: 10px`,
`padding: 12px`). Card (`.ov-card`): bg `--bg`, `0.5px solid var(--border2)`,
radius 8px, padding `11px 13px`; title (`.ov-title`) mono 9px uppercase `--muted`.

Four charts: *Lines by file* (fill = `langColor`), *Functions by file*
(fill `--success`), *Complexity by file* (sorted high→low, per-value complexity
color), *Language breakdown* (lines per language as %, `langColor`).

Bar row pattern:
```css
.bar-row   { display: flex; align-items: center; gap: 7px; }
.bar-label { font-size: 10px; width: 72px; ellipsis; }
.bar-track { flex: 1; height: 5px; background: var(--bg2); border-radius: 2px; }
.bar-fill  { height: 100%; border-radius: 2px; transition: width 0.4s; }
.bar-count { font-size: 10px; color: var(--muted); min-width: 28px; text-align: right; }
```

### Function rows (Summary / Functions listings)

`.fn-row` — padding `6px 12px`, `gap: 9px`, bottom `0.5px` divider, hover `--bg2`.
Anatomy: name (mono 11px `--accent`, `flex: 1`) · file (10px `--muted`) ·
line count (`"45L"`, 10px `--muted`) · complexity badge (`.cx-badge` using
`.cx-low/.cx-mid/.cx-high`). A `.fn-trace-btn` opens the Calls map rooted at that
function. Rows expand in place to show source (`.fn-source`, line-numbered).

### Calls / Trace map

The Calls mode renders a DAG (`src/trace-graph.js` → `src/views/trace-graph-view.js`)
as inline SVG (`.trace-svg`). Nodes are rounded rects tinted by complexity
(`.trace-svg-node.cx-low/.cx-mid/.cx-high`), `.warn` nodes get a danger stroke,
`.cycle` nodes a dashed stroke. Edges and pills carry **confidence**:
`conf-high` success, `conf-med` purple, `conf-low` muted/dashed, `conf-amb`
warn/dashed, `conf-cycle` danger — so the regex heuristic's certainty is always
visible (per CLAUDE.md: ambiguous/unresolved calls must be marked). Caller pills
use `.pill.in` (success), callee pills `.pill.out` (accent). A breadcrumb strip
(`.trace-crumbs`) tracks re-rooting history with prev/next nav.

### Deps / Libraries

Library cards (`.lib-card`, 3-up grid): name (mono 12px 500), `"used N×"`, a
proportional usage bar (`--accent` external, neutral for stdlib), and a type
label. **Stdlib set** (`src/tabs.js`):
`os sys io re json math time datetime logging typing pathlib collections itertools functools threading subprocess unittest abc copy enum dataclasses string random hashlib base64 urllib http socket`.

---

## Effects badges

Every function is tagged with the side-effects its body performs
(`src/effects.js`, `src/effects-config.js`): `net · fs · db · exec · dom · env`.
Detection is import-based plus pattern-based, run after strings/comments are
stripped; inherited effects propagate via reverse-BFS over callees.

`.effect-badge` — inline-block, `font: 10px/1 var(--font-mono)`, uppercase,
`letter-spacing: .04em`, padding `2px 5px`, radius 3px, `margin-left: 4px`.
- `.direct` → solid: white text on the effect color
  (`net #4d8df0 · fs #e08a3c · db #a874e0 · exec #e0584d · dom #4dbf7a · env #c8a93a`).
- `.inherited` → outlined: transparent bg, `1px solid currentColor` in the effect color.
- `.dashed` → `1px dashed currentColor` (weaker inheritance signal).

The toolbar fx-chips (above) filter the navigator by these tags. In-workspace
effect chips (`.fn-fx-chip.on`) light up in the per-effect color.

---

## Walk (full-screen overlay)

Opened from the toolbar (`🗺 Walk`) or key `1`; closed with **Esc** or the
back/close control. Rendered into `#fullscreen` (`src/views/walk.js`,
`src/views/fullscreen.js`). The overlay shell:

```css
.fullscreen { position: fixed; inset: 64px 0 0 0; z-index: 100; background: var(--bg); }
.fs-head    { padding: 14px 24px; gap: 16px; background: var(--bg2); border-bottom: 0.5px solid var(--border2); }
.fs-title-text { font-family: var(--font-sans); font-size: 18px; font-weight: 500; }
.fs-title-sub  { font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
.fs-close   { mono 12px 500; padding 8px 16px; radius 6px; 1px border; }
```

Inside, Walk uses a **master/detail layout** (`.walk-layout` → `.walk-grid` list
of step cards + `.walk-detail` pane), not the old prev/next filmstrip. Steps are
generated deterministically by `src/walker.js` (order: overview → archetype →
entry points → first hop → core modules → boundary → complexity hotspots →
utilities → config → orphans → external deps) — see CLAUDE.md for the signal
behind each step.

- **Step card** (`.walk-card`) — radius 12px; hover lifts with a soft shadow;
  `.selected` highlights with the step's category color. Header shows a step
  number, category tag (`.walk-cat-tag`), title, and count pills.
- **Category colors** (`STEP_COLORS`): `meta #888780 · entry #1D9E75 ·
  core #3B8BD4 · complexity #E24B4A · utils #EF9F27 · config #7F77DD ·
  deps #5DCAA5`.
- **Chips** (`.walk-fn-chip` / `.walk-file-chip`) — mono 10px, bg `--bg2`,
  `0.5px` border; hover fills accent/white. Clicking a chip jumps the workspace
  to that file/function and exits the overlay.
- **Note strip** (`.walk-note`) — mono 11px, accent left-border, an actionable
  tip generated from data (never hardcoded).

---

## Graph (full-screen overlay)

Opened with `◉ Graph` or key `2`. Rendered as **inline SVG** (`src/views/graph.js`,
`.graph-svg`) — not canvas. Files are nodes, imports are edges. Per the README:
circular layout, node size ∝ √lineCount.

- **Edges** (`.graph-edge`, 1px): base `rgba(120,118,111,0.28)`, dimmed
  `…0.18`; on selection an out-edge highlights `--accent` (`.edge-out`) and an
  in-edge `--success` (`.edge-in`), both 2px.
- **Nodes** (`.graph-node`, `transition: opacity .15s`): `.dim` 0.45 opacity,
  `.focus` full; search matches stroke accent (`.match`) and bold the label.
- **Controls** in the overlay head: a fit-to-view button (`.graph-fit-btn`), a
  search box (`.graph-search`), a zoom group (`.graph-zoom-btn`), directory
  grouping toggles (`.graph-dir-chip`), and a legend (`.graph-legend`).
- **Selection** — click a node to select it in the workspace; double-click exits
  Graph and keeps it selected.

---

## Smells (full-screen overlay)

Opened from the smell badge or key `3`. Lists every finding from the five
detectors (`src/smells.js`): *hallucinated calls*, *broken imports*,
*suspicious comments*, *swallowed catches*, *placeholders*. Filterable by kind;
findings are collapsible (location/kind shown by default, click to expand
snippet + rationale). Clicking a finding opens the file in the workspace and
exits the overlay. Severity uses the same `warn` (danger) / `info` (warn)
coloring as the toolbar badge.

---

## Path painter

On the Graph, right-click a node to set the path **start**, right-click a second
to set the **end** (`src/paths.js`, `src/views/paint-strip.js`). A chip strip
(`.paint-strip`) shows both endpoints and the number of simple paths found;
non-path nodes fade. A start with no end shows forward reach; a **reverse**
toggle flips to "everything that can reach here." `clear ✕` drops the painter.

---

## Git URL modal

Opened by `Load URL` (`src/git-modal.js`). A centered backdrop (`.gm-overlay`)
over a card (`.gm-card`): title (`.gm-title`, 15px 600), hint (`.gm-hint`, 12px
`--muted`), labelled inputs (`.gm-input`, focus border accent) for a
`github.com/owner/repo` or `gitlab.com/group/repo` URL (optional `/tree/branch`)
plus an optional GitHub token, a status line (`.gm-status`, `.err`/`.ok`
variants), and actions (`.gm-load` accent-filled, `.gm-cancel` ghost). Fetching
is client-side against the host REST API; the token lives in `sessionStorage`
only. Capped at 500 files.

---

## Help panel

Opened by the `?` button or key `h` / `?` (`src/views/help.js`). A dimmed
backdrop (`.help-panel`, `rgba(0,0,0,.45)`, z-index 200) over `.help-card`
(`width: min(720px, 100%)`, radius 12px, padding `24px 28px`, drop shadow). Title
in Sans 20px 500; `.help-item` is a `140px 1fr` grid mapping a mono accent term
(`.help-term`) to its definition. Explains the effect/smell/confidence
abbreviations. Click the backdrop or `Esc` to close.

---

## Empty & drop states

With no project loaded, the workspace shows an empty/upload state prompting the
user to drop a folder, use the directory picker, or load a URL. (There is no
"load demo project" button.)

**Drag & drop overlay** (`#drop-overlay`, `.drop-overlay`) covers the main pane:
`position: absolute; inset: 0; z-index: 10`, `background: rgba(59,139,212,0.08)`,
`2px dashed var(--accent)`, radius 4px, `display: none` → `flex` on dragenter.
Message (`.drop-msg`, mono 13px accent): **"Drop folder to parse"**. Shown on
`dragenter`, hidden on `dragleave`/`drop`.

---

## Interactions summary

| Action | Result |
|---|---|
| Click a file in the navigator | Selects it; workspace shows the file detail (current mode) |
| Click a function under a file | Selects it; workspace shows the function detail |
| Type in the navigator search | Flips the tree to flat `file › function` matches |
| Click `⌂ Repo` / the logo | Clears selection → repo overview; logo also exits overlays + help |
| Click a mode button (Walk/Graph) | Opens that full-screen overlay |
| Click the smell badge | Opens the Smells overlay |
| Toggle a toolbar fx-chip | Filters the navigator to items with that effect |
| Click a detail mode chip | Switches mode (sticky across selections) |
| Click a chip in a Walk step | Jumps the workspace to that file/function, exits Walk |
| Click a node in Graph | Selects it in the workspace; double-click exits Graph |
| Right-click two Graph nodes | Sets path-painter start/end |
| Click a finding in Smells | Opens that file in the workspace, exits Smells |
| Click `Load URL` | Opens the git-URL modal |
| Click `Drop repo / files` | Opens the directory picker (`webkitdirectory`) |
| Drag a folder onto the page | Parses all valid files |
| Keys `1` / `2` / `3` | Toggle Walk / Graph / Smells overlay |
| Key `h` or `?` | Toggle the help panel |
| `Esc` | Close help, then exit a full-screen overlay |

---

## Transitions

`0.1s`–`0.15s` for hover/active states, `0.12s` for toolbar controls, `0.4s` for
bar-fill widths on initial render. No keyframe animations. The only transforms
are the 1px nudge on smell-badge hover and the walk-card hover lift. Keep it
mostly still.

---

## Native form elements

```css
select, input[type="text"] {
  font-family: var(--font-mono); font-size: 11px;
  padding: 3px 7px; border-radius: 4px;
  border: 0.5px solid var(--border2);
  background: var(--bg); color: var(--text);
}
input:focus { outline: none; border-color: var(--accent); }
```

---

## Things that must NOT appear in this UI

- Gradients of any kind, or "glassmorphism" / frosted effects
- Box shadows beyond the few intentional ones: active mode button
  (`0 1px 3px`), walk-card hover lift, and the help/git modal cards
- Border radius larger than 12px
- Inter, Roboto, system-ui, or Arial used for data/labels/metadata/counts/
  filenames/function names — those are always IBM Plex Mono
- Sans-serif used for anything other than prose (walk/overlay/modal titles & body)
- Colored backgrounds on cards (cards are `--bg`; the toolbar/navigator/statbar
  sit on `--bg2`)
- Decorative separators, ornaments, or icons used purely as decoration
- Emoji outside their established spots (the `🗺`/`◉` mode buttons, the `⚠`/`✓`
  smell badge, empty-state icons)
- Color used for anything other than meaning (selection/accent or semantic state)
```

