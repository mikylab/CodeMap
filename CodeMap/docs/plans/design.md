# Codemap — UI Design Specification
> Hand this file to Claude Code alongside CLAUDE.md.
> This spec describes every visual and interaction detail of the UI so it can be reproduced exactly.

---

## Aesthetic direction

**Industrial / utilitarian monospace dashboard.**
Think IDE + terminal + instrument panel. Every element should feel like it was built by an engineer for engineers — precise, dense, functional, zero decoration for its own sake.

- All labels, values, and UI chrome use **IBM Plex Mono** (monospace). This is non-negotiable — it defines the entire character of the UI.
- Body copy / prose descriptions (walk step content) use **IBM Plex Sans**.
- The palette is deliberately restrained: near-black/white surfaces, a single blue accent, semantic colors only for meaning (green = healthy, amber = warn, red = danger).
- No gradients. No shadows. No rounded corners larger than 8px. No decorative elements.
- Border weight: **0.5px** everywhere. Not 1px. The thinness is intentional and creates a precision instrument feel.
- The overall effect should feel like a professional CLI tool that grew a UI — not a SaaS product that grew a terminal.

---

## Fonts

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap');

--font-mono: 'IBM Plex Mono', monospace;
--font-sans: 'IBM Plex Sans', sans-serif;
```

**Usage rules:**
- `IBM Plex Mono 400` — all metadata, labels, counts, file names, function names, code values, stat numbers, badges, tabs, buttons, sidebar items, bar chart labels
- `IBM Plex Mono 500` — heading-level mono text (logo, tab pill active state, stat values, section titles)
- `IBM Plex Sans 400` — walk step body prose only
- `IBM Plex Sans 500` — walk step card titles only
- **Never use any other font weight.** 400 and 500 only.
- **Never use Inter, Roboto, system-ui, or Arial.**

---

## Color tokens

All colors must be expressed as CSS variables. Surfaces adapt to light/dark mode automatically.

```css
/* Surfaces */
--bg:    var(--color-background-primary);    /* white / near-black */
--bg2:   var(--color-background-secondary);  /* slightly off — sidebar, toolbar, cards */
--bg3:   var(--color-background-tertiary);   /* even more off — hover states, pill bg */

/* Text */
--text:  var(--color-text-primary);   /* full opacity */
--muted: var(--color-text-secondary); /* ~60% — subtitles, labels, metadata */

/* Borders */
--border:  var(--color-border-tertiary);  /* 0.15α — dividers inside sections */
--border2: var(--color-border-secondary); /* 0.30α — panel edges, card outlines */

/* Accent colors — use ONLY for semantic meaning */
--accent:  #3B8BD4;   /* blue  — primary selection, active state, info */
--success: #1D9E75;   /* green — healthy, low complexity, stdlib */
--warn:    #BA7517;   /* amber — medium complexity, warning */
--danger:  #E24B4A;   /* red   — high complexity, error, unused */
--purple:  #7F77DD;   /* purple — config/schema category */
--teal:    #5DCAA5;   /* teal  — deps category */
```

**Complexity color rule** (used everywhere complexity is displayed):
```
cx < 5  → --success (#1D9E75)
cx 5–7  → --warn    (#BA7517)
cx >= 8 → --danger  (#E24B4A)
```

**Complexity badge** (colored background chip):
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

**Language colors** (used for file ext badges, bar fills, graph nodes):
```
Python     #3B8BD4  (blue)
JavaScript #EF9F27  (amber)
TypeScript #185FA5  (dark blue)
JSX/TSX    #EF9F27 / #185FA5
Rust       #D85A30  (orange-red)
Go         #5DCAA5  (teal)
Java       #E85D24  (orange)
C/C++      #AFA9EC  (muted purple)
Ruby       #E24B4A  (red)
Shell      #1D9E75  (green)
Swift      #E85D24  (orange)
Kotlin     #7F77DD  (purple)
```

---

## Spacing system

Use only these values. Do not invent new ones.

```
2px   — internal padding for tiny badges/pills
4px   — gap between inline elements
5px   — gap between bar chart rows
6px   — padding inside badges
7px   — gap in file list items
8px   — gap between toolbar elements; internal card padding
9px   — gap below chart section headers
10px  — toolbar height padding; stat cell padding top/bottom
11px  — search input padding
12px  — panel content padding; grid gaps
14px  — sidebar item horizontal padding; standard panel horizontal padding
16px  — walk step indentation unit; grid gap
24px  — upload splash padding
32px  — upload splash top/bottom padding
```

**Border radius:**
- `4px` — badges, ext chips, small pills, progress dots (use `border-radius: 3px` for mono badges)
- `6px` — walk progress dots (when current)
- `8px` — `var(--border-radius-md)` — standard: cards, inputs, buttons, tab pills, file ext badges
- `12px` — `var(--border-radius-lg)` — walk cards only

---

## Page structure

```
┌─────────────────────────────────────────────────────────┐
│  TOOLBAR  (48px tall, --bg2 background)                 │
├───────────┬─────────────────────────────────────────────┤
│           │  STAT BAR  (5 cells, ~52px tall)            │
│  SIDEBAR  ├─────────────────────────────────────────────┤
│  (200px   │  MAIN PANEL  (fills remaining height)       │
│   wide)   │  (tab-switched content area)                │
│           │                                             │
└───────────┴─────────────────────────────────────────────┘
```

**Full-page layout:**
```css
.root { display: flex; flex-direction: column; }
.layout { display: grid; grid-template-columns: 200px 1fr; min-height: 560px; }
.main { display: flex; flex-direction: column; overflow: hidden; }
```

---

## Toolbar

Height: ~48px (padding 8px 14px).
Background: `--bg2`.
Bottom border: `0.5px solid var(--border2)`.

**Left to right:**
1. **Logo** — `codemap` in IBM Plex Mono 500 13px `--text`, space, `v2` in 400 `--muted`
2. **Tab pills group** — pill-style switcher in a `--bg3` rounded container (padding 3px, radius 6px)
3. **Spacer** (flex: 1)
4. **Project badge** — monospace 10px `--muted`, border `0.5px --border2`, bg `--bg`, radius 4px, padding 4px 8px. Shows current project name or "no project".
5. **Drop button** — "Drop repo / files", monospace 11px 500, border `0.5px --accent`, color `--accent`, bg transparent, radius 8px, padding 5px 12px. On hover: bg `--accent`, color white.

**Tab pills:**
```css
.tab-pills { display: flex; gap: 2px; background: var(--bg3); padding: 3px; border-radius: 6px; }
.tab-pill {
  font-family: var(--font-mono); font-size: 10px; font-weight: 500;
  padding: 4px 10px; border-radius: 4px; border: none; background: transparent;
  color: var(--muted); cursor: pointer; transition: all 0.15s;
}
.tab-pill.active { background: var(--bg); color: var(--text); box-shadow: 0 0.5px 2px rgba(0,0,0,.1); }
```

Tab labels (in order): `Overview` `Walk` `Functions` `Trace` `Graph` `Libraries`

---

## Sidebar

Width: 200px. Background: `--bg2`. Right border: `0.5px solid var(--border2)`.
Contains two sections separated by `0.5px solid var(--border)`.

### Section header
```css
.sb-head {
  font-family: var(--font-mono); font-size: 10px; font-weight: 500;
  color: var(--muted); text-transform: uppercase; letter-spacing: 0.07em;
  padding: 10px 14px 6px; display: flex; align-items: center; justify-content: space-between;
}
/* Count badge next to "Files" label */
.sb-count {
  background: var(--bg3); border-radius: 3px; padding: 1px 5px; font-size: 9px;
}
```

### Filter input
Padding: 4px 10px 8px. Bottom border `0.5px solid var(--border)`.
Input: full width, mono 11px, padding 4px 8px, radius 4px, border `0.5px --border2`, bg `--bg`.
Placeholder: `"filter..."`.

### File list items
```css
.file-item {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 14px; cursor: pointer; font-family: var(--font-mono);
  border-left: 2px solid transparent; transition: all 0.1s;
}
.file-item:hover { background: var(--bg3); }
.file-item.active { background: var(--bg3); border-left-color: var(--accent); color: var(--accent); }
```

**File item anatomy (left to right):**
1. **Ext badge** — 2–3 char extension (e.g. `py`, `ts`), font-size 9px, font-weight 500. Background: `{langColor}22` (22 = 13% alpha hex). Color: `{langColor}`. Padding 1px 4px, radius 2px.
2. **File name** — font-size 11px, `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1`. Full path in `title` attribute.
3. **Complexity value** — font-size 9px, font-weight 500, colored by the complexity color rule.

---

## Stat bar

5 equal-width cells in a flex row. Each cell: `flex: 1`, padding `10px 14px`, right border `0.5px solid var(--border)` (last cell: no right border).

```css
.stat-lbl {
  font-family: var(--font-mono); font-size: 9px; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 3px;
}
.stat-val {
  font-family: var(--font-mono); font-size: 18px; font-weight: 500; line-height: 1;
}
.stat-sub { font-size: 10px; color: var(--muted); margin-top: 2px; font-family: var(--font-mono); }
```

**Cells (label → value → sub):**
1. `Lines` → total line count formatted with `toLocaleString()` → `"across N files"`
2. `Functions` → total function count → `"avg N lines each"`
3. `Libraries` → unique external import count → `"N unused"`
4. `Complexity` → average cyclomatic (1 decimal) → `"avg cyclomatic"` — value colored by complexity rule
5. `Languages` → count of distinct languages → comma-joined language names

---

## Overview tab

2-column grid of cards. `grid-template-columns: 1fr 1fr`, `gap: 10px`, `padding: 12px`. `overflow-y: auto`.

**Card:**
```css
.ov-card {
  background: var(--bg); border: 0.5px solid var(--border2);
  border-radius: var(--border-radius-md); padding: 11px 13px;
}
.ov-title {
  font-family: var(--font-mono); font-size: 9px; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 9px;
}
```

**4 cards:**
1. "Lines by file" — bar chart, fill color = `langColor` per file
2. "Functions by file" — bar chart, fill color = `--success`
3. "Complexity by file" — sorted high→low, fill color = complexity color rule per value
4. "Language breakdown" — lines per language as %, fill color = `langColor`

**Bar row pattern:**
```css
.bar-row { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; }
.bar-label { font-family: var(--font-mono); font-size: 10px; width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { flex: 1; height: 5px; background: var(--bg2); border-radius: 2px; overflow: hidden; }
.bar-fill  { height: 100%; border-radius: 2px; transition: width 0.4s; }
.bar-count { font-family: var(--font-mono); font-size: 10px; color: var(--muted); min-width: 28px; text-align: right; }
```

---

## Walk tab

The codebase tour. Guided step-by-step navigation through the codebase.

**Step category colors:**
```js
const STEP_COLORS = {
  meta:       '#888780',  // gray
  entry:      '#1D9E75',  // green
  core:       '#3B8BD4',  // blue
  complexity: '#E24B4A',  // red
  utils:      '#EF9F27',  // amber
  config:     '#7F77DD',  // purple
  deps:       '#5DCAA5',  // teal
};
```

### Walk bar (top navigation strip)
```
[← prev]  [Step title — IBM Plex Mono 500 12px]  [N / Total]  [next →]
```
Background: `--bg2`. Border bottom: `0.5px solid --border2`. Padding 8px 14px.

- `← prev` / `next →` buttons: mono 11px, border `0.5px --border2`, bg `--bg`, radius 4px, padding 4px 10px. `next →` has class `primary`: border-color `--accent`, color `--accent`; on hover bg `--accent` color white.
- Step counter (`N / Total`): mono 10px `--muted`.
- `← prev` is `disabled` on step 0.

### Progress trail
`display: flex; gap: 4px; align-items: center; padding: 0 14px 8px; border-bottom: 0.5px solid var(--border); flex-wrap: wrap;`

**Each dot:**
```css
.progress-dot {
  width: 8px; height: 8px; border-radius: 50%;
  border: 1.5px solid var(--border2); cursor: pointer; transition: all 0.15s;
}
.progress-dot.done    { background: var(--success); border-color: var(--success); }
.progress-dot.current { background: {stepColor}; border-color: {stepColor}; box-shadow: 0 0 0 2px {stepColor}40; }
```
Clicking any dot jumps to that step.

### Walk body
`overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;`

**Highlight card** (main description):
```css
.walk-card.highlight {
  background: var(--bg); border: 0.5px solid {stepColor};
  border-radius: var(--border-radius-lg); padding: 13px 15px;
}
/* Title */
font-family: var(--font-sans); font-size: 12px; font-weight: 500; color: {stepColor}; margin-bottom: 4px;
/* Body */
font-family: var(--font-sans); font-size: 12px; color: var(--muted); line-height: 1.6;
```

**Files card** (if step has associated files):
Same card style (no highlight border). Title: `"Files in this section"` in step color. Content: chip row.

**Functions card** (if step has associated functions):
Same. Title: `"Key functions"`. Content: chip row.

**Function/file chips:**
```css
.walk-fn-chip {
  font-family: var(--font-mono); font-size: 10px; padding: 2px 7px;
  border-radius: 3px; background: var(--bg2); border: 0.5px solid var(--border2);
  color: var(--text); cursor: pointer; transition: background 0.1s;
}
.walk-fn-chip:hover { background: var(--bg3); }
```
Clicking a file chip selects that file in the sidebar. Clicking a function chip jumps to Trace tab rooted at that function.

**Note strip** (bottom of each step):
```css
.walk-note {
  font-family: var(--font-mono); font-size: 11px; padding: 8px 11px;
  border-radius: 4px; border-left: 3px solid var(--accent);
  background: var(--bg2); color: var(--muted); line-height: 1.5;
}
```
Contains an actionable maintainability tip (generated from data, not hardcoded).

---

## Functions tab

### Toolbar strip
`display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 0.5px solid var(--border);`

- "Sort" label: mono 11px `--muted`
- `<select>` with options: Name / Lines ↓ / Complexity ↓ / Connections ↓
- Right-aligned function count label: mono 11px `--muted`, e.g. `"94 functions"` or `"22 functions in model.py"`

### Function rows
`overflow-y: auto; flex: 1`

```css
.fn-row {
  display: flex; align-items: center; gap: 9px; padding: 6px 12px;
  border-bottom: 0.5px solid var(--border); cursor: pointer; transition: background 0.1s;
}
.fn-row:hover { background: var(--bg2); }
```

**Row anatomy (left to right):**
1. **Function name** — mono 11px `--accent`, `flex: 1`, ellipsis overflow
2. **File name** — mono 10px `--muted`, `min-width: 80px`, just the filename (not full path)
3. **Line count** — mono 10px `--muted`, `min-width: 36px; text-align: right` — format: `"45L"`
4. **Complexity badge** — mono 10px 500, `padding: 2px 6px; border-radius: 3px; min-width: 32px; text-align: center` — uses `.cx-low` / `.cx-mid` / `.cx-high` classes

Clicking any row navigates to Trace tab with that function as root.

---

## Trace tab

### Header strip
`padding: 8px 12px; border-bottom: 0.5px solid var(--border); display: flex; align-items: center; gap: 8px; background: var(--bg2);`

- "Root:" label — mono 11px `--muted`
- `<select>` populated with all function names — format `"fnName (filename.ext)"`. `flex: 1; max-width: 200px`.

### Body: two-column layout
`display: grid; grid-template-columns: 240px 1fr; flex: 1; overflow: hidden;`

**Left: Trace tree** (240px, `overflow-y: auto`, border-right `0.5px solid --border2`, padding 8px 0)

Each trace node:
```css
.trace-node {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 4px 12px; cursor: pointer; transition: background 0.1s;
}
.trace-node:hover { background: var(--bg2); }
```

Node connector (the dot + vertical line):
```css
/* Wrapper column */
display: flex; flex-direction: column; align-items: center; width: 12px; flex-shrink: 0;

.trace-dot {
  width: 8px; height: 8px; border-radius: 50%;
  border: 1.5px solid var(--accent); background: var(--bg); flex-shrink: 0; margin-top: 4px;
}
.trace-dot.filled { background: var(--accent); }
.trace-dot.warn   { border-color: var(--warn); background: var(--warn); }

.trace-vline { width: 1.5px; background: var(--border2); min-height: 14px; margin: 2px 0 0 3.25px; }
```

Node text (right of connector):
- Function name: mono 11px `--text`
- Sub: mono 10px `--muted` — format `"{filename} · L{lineNum} · cx:{value}"`

Nesting: `margin-left: {depth * 16}px` on the wrapper div.

**Right: Detail panel** (`overflow-y: auto; padding: 14px`)

```
{fnName}()                    ← mono 14px 500 --text
{file} · line N · N lines · complexity {N}   ← mono 10px --muted, cx value colored
                                               by complexity rule

Same-file functions           ← section label: mono 9px --muted uppercase 0.07em tracking
[fnA →]  [fnB →]  ...        ← pills with class "out" (accent colored)

File                          ← section label
{full/path/to/file.ext}       ← mono 11px --muted
```

**Pills:**
```css
.pill {
  display: inline-block; font-family: var(--font-mono); font-size: 10px;
  padding: 2px 8px; border-radius: 3px; margin: 2px 3px 2px 0;
  border: 0.5px solid var(--border2); background: var(--bg); color: var(--text);
  cursor: pointer; transition: background 0.1s;
}
.pill:hover { background: var(--bg2); }
.pill.in  { border-color: var(--success); color: var(--success); }  /* callers */
.pill.out { border-color: var(--accent); color: var(--accent); }    /* callees */
```

---

## Graph tab

Canvas element, `width: 100%`, `height: 400px`. Re-renders on tab switch and resize.

**Layout algorithm:** Circular, deterministic.
```js
pos[i] = {
  x: centerX + R * Math.cos((i / N) * 2 * Math.PI - Math.PI / 2),
  y: centerY + R * Math.sin((i / N) * 2 * Math.PI - Math.PI / 2),
}
// R = min(W, H) * 0.33
```

**Node rendering:**
- Radius: `8 + Math.sqrt(file.lineCount / 30)` — larger files = bigger nodes
- Fill: `{langColor}cc` (80% alpha)
- Stroke: `{langColor}`, lineWidth 1
- Label below node: mono 10px, `--color-text-primary` adapted for dark mode, centered, `y = nodeY + radius + 12`
- Truncate label at 10 chars with `…`

**Edge rendering:**
- Connect files that share the same language, or have detected import relationships
- Stroke: `rgba(150, 148, 140, 0.2)` light mode / `rgba(100, 98, 90, 0.2)` dark mode
- lineWidth: 0.8px

**Dark mode detection:**
```js
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const textColor = isDark ? '#c2c0b6' : '#3d3d3a';
```

**HiDPI:**
```js
canvas.width  = W * devicePixelRatio;
canvas.height = H * devicePixelRatio;
canvas.style.width  = W + 'px';
canvas.style.height = H + 'px';
ctx.scale(devicePixelRatio, devicePixelRatio);
```

---

## Libraries tab

3-column grid. `grid-template-columns: repeat(3, 1fr)`, `gap: 8px`, `padding: 12px`, `overflow-y: auto`.

**Library card:**
```css
.lib-card {
  background: var(--bg); border: 0.5px solid var(--border2);
  border-radius: var(--border-radius-md); padding: 10px 12px; cursor: pointer;
}
.lib-card:hover { border-color: var(--accent); }
```

**Card anatomy (top to bottom):**
1. **Library name** — mono 12px 500 `--text`
2. **Usage count** — mono 10px `--muted` — format `"used N×"`
3. **Usage bar** — `height: 3px; border-radius: 2px; margin-top: 7px; min-width: 4px` — width proportional to max usage. Color: `--accent` for external, `#888780` for stdlib
4. **Type label** — mono 9px uppercase 0.06em tracking — `"stdlib"` or `"external"`, colored to match bar

**Stdlib detection** (exact set):
`os sys io re json math time datetime logging typing pathlib collections itertools functools threading subprocess unittest abc copy enum dataclasses string random hashlib base64 urllib http socket`

---

## Splash / empty states

Shown when no project is loaded. Used in Overview and Walk panels.

```css
.upload-splash {
  padding: 32px 24px; text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
```

Elements:
- Icon: emoji, font-size 28px (📁 for overview, 🗺️ for walk)
- Title: mono 13px 500 `--text`
- Subtitle: mono 11px `--muted`, line-height 1.6, max-width 320px
- Demo button: mono 11px, padding 5px 14px, radius 4px, border `0.5px --border2`, bg `--bg2`

---

## Drag & drop overlay

Absolutely positioned over the panel host. `inset: 0; z-index: 10`.

```css
.drop-overlay {
  position: absolute; inset: 0;
  background: rgba(59, 139, 212, 0.08);
  border: 2px dashed var(--accent); border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.drop-msg { font-family: var(--font-mono); font-size: 13px; color: var(--accent); text-align: center; }
```

Hidden by default (`display: none`). Shown on `dragover`, hidden on `dragleave` and `drop`.

---

## Interactions summary

| Action | Result |
|---|---|
| Click file in sidebar | Sets active file; if Functions tab open, filters to that file |
| Click file chip in Walk | Sets active file in sidebar |
| Click function chip in Walk | Switches to Trace tab, roots trace at that function |
| Click function row in Functions | Switches to Trace tab, roots trace at that function |
| Click progress dot in Walk | Jumps to that walk step |
| Click node in Trace tree | Shows detail in right panel |
| Click `.pill.out` in Trace detail | Re-roots trace at that function |
| Change sort in Functions toolbar | Re-sorts function list in place |
| Change root select in Trace | Re-renders trace tree |
| Type in sidebar filter | Filters file list live |
| Drag folder onto panel | Parses all valid files |
| Click "Drop repo / files" | Opens directory picker (webkitdirectory) |
| Click "Load demo project" | Loads hardcoded demo data |

---

## Transitions

All transitions use `0.1s` for hover states, `0.15s` for active/selection state changes, `0.4s` for bar fill widths on initial render.

```css
.file-item    { transition: all 0.1s; }
.fn-row       { transition: background 0.1s; }
.tab-pill     { transition: all 0.15s; }
.drop-btn     { transition: all 0.15s; }
.bar-fill     { transition: width 0.4s; }
.walk-fn-chip { transition: background 0.1s; }
.lib-card     { transition: border-color 0.15s; }
```

No other animations. No keyframe animations. No transforms. Keep it still.

---

## Native form elements

All `<select>` elements:
```css
select {
  font-family: var(--font-mono); font-size: 11px;
  padding: 3px 7px; border-radius: 4px;
  border: 0.5px solid var(--border2);
  background: var(--bg); color: var(--text);
}
```

All `<input type="text">`:
```css
input[type="text"] {
  font-family: var(--font-mono); font-size: 11px;
  padding: 4px 8px; border-radius: 4px;
  border: 0.5px solid var(--border2);
  background: var(--bg); color: var(--text);
}
```

---

## Things that must NOT appear in this UI

- Gradients of any kind
- Box shadows (except `box-shadow: 0 0.5px 2px rgba(0,0,0,.1)` on active tab pills only)
- Border radius larger than 12px anywhere
- Font weights other than 400 and 500
- Inter, Roboto, system-ui, Arial, or any sans-serif other than IBM Plex Sans
- Any sans-serif used for data/labels/metadata/counts/filenames/function names — those are always IBM Plex Mono
- Colored backgrounds on cards (cards are always `--bg`)
- Decorative separators, ornaments, or icons used as decoration
- Animations with `transform` or `opacity` (except `transition` on hover states listed above)
- Emoji in any context other than the upload splash state icons
- Any text larger than 18px (stat values) except the logo (13px)
- Purple/indigo gradient color schemes
- "Glassmorphism" or frosted effects
- Modal dialogs or popovers (everything is inline)