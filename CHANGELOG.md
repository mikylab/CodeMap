# Changelog

All notable changes to Codemap are recorded here. Newest first.

## Unreleased

- fix(source-popover): popover and its candidate buttons referenced CSS variables that don't exist in this codebase (`--fg`, `--bg-elev`, `--hover`, `--fg-soft`), so the fallback values made ambiguous-identifier candidate buttons unreadable in light mode (light text on a light background). Switched to the theme's actual variables (`--text`, `--bg2`, `--bg3`, `--muted`, `--border2`, `--accent`) so the popover now themes correctly in both modes.
- fix(history): the workspace back button now restores the scroll position you were at when you navigated away, instead of resetting to the top. Click-tracing an identifier deep in a long source file and then going back lands you back at that line rather than at line 1. `captureSnapshot()` records `.ws-body` scrollTop; `restoreSnapshot()` stashes it on `STATE.pendingScrollTop` and the renderer applies it to the freshly-rendered body.
- fix(source-colour): the `--tok-*` palette block in `styles.css` contained an inline `/* ... */` example inside the outer comment; CSS comments don't nest, so the inner `*/` closed the outer comment early and the parser's error recovery silently discarded the entire `:root { --tok-* }` block. Result: every syntax/identifier colour fell back to default text. Replaced the offending example so the palette and all kind-based colouring now render.
- feature: **IDE-style syntax colouring in the Source view.** Strings, comments, keywords, and numbers now get persistent colours so source code is scannable at a glance. Resolved identifiers also get distinct colours per kind: function (blue), class (teal), import (amber), builtin (purple-soft). Clickable kinds still carry a subtle underline so the click affordance is visible. Single tokenizer pass (`classifySource`) reuses the parser's existing string/comment state machine, so multi-line docstrings and block comments are coloured correctly without re-parsing.
- fix(source): identifiers inside docstrings, block comments, string literals, and trailing `# ` / `// ` comments are no longer annotated. Source view now masks strings/comments via the same `maskLiterals` pass the parser already uses, so prose tokens (e.g. "AUDIT") inside `"""..."""` stay inert.
- fix(source): Python `from pkg import Name` now adds `Name` to the resolve index, so types like `Optional`, `Dict`, `Any`, and project classes brought in via `from typing import ...` / `from .schemas import ...` resolve as imports in the Source view instead of showing as unresolved.
- ui(source): clearer affordances per identifier kind. Clickable kinds (function/class/import) get a subtle solid underline; ambiguous gets a dotted warn-colored underline; hover-only kinds (param/local/builtin) show only a background tint on hover; unresolved gets no decoration at all (the tooltip still explains).
- feature: **Identifier resolution in Source view.** Every identifier-shaped token now hovers for a kind+location tooltip and clicks to jump to its definition where one exists. Resolves `function` / `class` / `import` / `param` / `local` / `builtin` deterministically from `STATE.resolveIndex`. Ambiguous names (same identifier in multiple files) show all candidates in a sticky tooltip and let you pick. Unresolved tokens (external libs, dynamic dispatch) get a dashed underline rather than silent treatment — honest cartography at the token level. Same-file shadowing (param/local with the same name as a function) surfaces a warning in the tooltip. New `src/resolver.js` is a pure module; `src/source-annotate.js` was rewritten to route every identifier through it, replacing the call-site/import-line-only path.
- fix(lineage): GitHub branch enrichment is now generation-guarded — a slow Branches API call from a previous repo can no longer overwrite the current `STATE.lineage` when its promise resolves after the user has loaded a different repo.
- fix(hash-bootstrap): URL restore for refs containing `/` (e.g. `feature/login`, `release/1.2`) now loads the correct branch. The bootstrap previously re-built `host.com/owner/repo/tree/<ref>` and re-parsed it, which truncated the ref at the first slash and treated the remainder as a subpath.
- fix(hash-bootstrap): GitLab refs are restored correctly — the bootstrap was rebuilding `gitlab.com/<owner>/<repo>/tree/<ref>` but `parseRepoUrl` requires the `/-/tree/` separator, so the ref was always dropped. Both issues fixed by constructing the fetch spec directly from `repoFromHash` output instead of round-tripping through a URL string.
- fix(ingest): oversized markdown docs (README, `docs/**.md` over `MAX_BYTES`) now surface in the warnbar via `noteTooLarge` instead of being silently dropped from both the parser path and the Docs tab.
- fix(history): `snapshotsEqual` now compares `docPath`, so two consecutive doc snapshots for different docs are no longer treated as duplicates. Back navigation across the in-doc switcher now returns to the doc the user was actually on.
- fix(hash): `applyHash` now resets `STATE.fullscreen` / selection / `walkIdx` / `selectedLineageBranch` when the corresponding hash field is absent, so browser back/forward and external hash edits no longer leave stale overlays open or stale docs/files selected.
- fix(hash): unknown `overlay=` values are ignored (previously rendered an empty `'undefined'`-titled panel). `overlay=docs` and `overlay=lineage` also no-op when STATE has no docs / no lineage data.
- fix(hash): unresolved `file=` / `fn=` / `doc=` values (different repo, case mismatch, filtered file) are stashed in `STATE.pendingHashParts` and re-emitted by `serializeState`, so a shared link survives the first `renderAll` instead of being clobbered by `history.replaceState`.
- fix(git-fetch): `docs/**` paths are no longer exempt from `shouldSkipPath`, so vendored markdown under `docs/node_modules/`, `docs/.git/`, etc. no longer pollutes the Docs tab or burns download budget against the 500-file cap.
- fix(hash): shareable URL state actually restores now. The first `renderAll()` at startup was overwriting `location.hash` with the empty-state serialization before bootstrap (URL load) or a folder-drop could read the incoming `file=` / `fn=` / `overlay=` fields. `writeHash()` now short-circuits while STATE has no files/docs, and `ingestComplete` applies `location.hash` after any ingest path (drag-drop, dir-picker, git URL) so dropped-folder restore works too.
- ui: **Docs** now has a top-bar button next to Walk / Graph / Lineage (hotkey `5`) that opens a fullscreen, searchable picker grid of every captured markdown doc — scales to dozens of docs without overflowing the toolbar. The navigator's Docs group is collapsed by default and toggled by clicking its header.
- fix(docs): rendered doc view now scrolls internally instead of overflowing the workspace pane, so long docs (README, design notes) are readable end-to-end.
- ui(docs): doc header now includes a `<select>` switcher listing every captured doc — switch between docs without leaving the doc view or routing through the picker.
- fix(docs): clicking an autolinked file or function inside a doc now records the doc in the navigation history, so the workspace back button (and `Backspace` / `Alt+←`) returns you to the doc instead of dropping you at the repo overview. The doc header now also shows the same `←` back button when history is non-empty.
- ui: Lineage overlay and rendered docs now use theme variables (`--text` / `--muted` / `--bg2` / `--bg3` / `--accent` / `--success` / `--danger`) instead of hardcoded dark-mode greys, so branch names, prose annotations, and code spans read correctly in both light and dark mode.
- feature: **Branch Lineage overlay** (hotkey `4`). Codemap now parses a `### Branch lineage` heading from your README (or any captured doc), extracts the hand-drawn ASCII tree of stacked branches and their prose annotations, and renders an interactive tree. When the repo was loaded via the URL loader, each node is annotated with "on GitHub" / "missing on GitHub" + a "View on GitHub" link, fetched once from the GitHub Branches API.
- feature: **Docs tab.** Captured markdown (root-level `*.md` plus everything under `docs/`) shows up in a new "Docs" group at the top of the navigator. Clicking a doc renders it in the workspace with a minimal in-tree markdown renderer (headings, lists, code, links, blockquotes — no external dependency). Inline backticked file paths and `funcName()` mentions auto-link to the matching file or function. A `### Branch lineage` section inside any doc renders as the interactive lineage tree inline.
- feature: **Shareable URL state.** The current view (selected file, function, doc, overlay, walk step, lineage branch) and — when loaded via URL — the repo origin are encoded in `location.hash`. Refreshes restore the view; URL-loaded sessions produce links that another viewer can paste to land in the same place.
- meta: add `package.json` (v3.0.0) and `src/version.js` so the public release has a canonical version. Toolbar logo now reads from `VERSION` instead of the hardcoded `v3`.
- docs: `CLAUDE.md` post-change workflow now requires a SemVer bump (kept in sync between `package.json` and `src/version.js`), describes how to cut a release section in the changelog, and hardens the commit-message rule against any mention of Claude / AI / LLMs / Co-Authored-By.
- ui: the workspace breadcrumb now ends with a non-navigating "you are here" chip for the current file/function, so the trail reads start → … → here even though the current node isn't in history.
- ui: README panel reworked — the section label and expand/collapse toggle sit in a sticky header, and the expanded body scrolls within a capped height, so you can collapse a long README without scrolling back to find the control. Body now renders in a proportional font for easier reading.
- Function/class detection now runs against a literal-masked copy of the source (string and comment contents blanked, length and line numbers preserved), so docstring and comment prose can no longer produce phantom definitions. Fixes a case where `class\s+(\w+)` reached across a blank line into a module docstring (`…Experiment class` then `One Experiment = …`) and invented a function `One`, which in turn produced a phantom `state` `unresolved-call`.
- Python keywords `except` and `elif` are no longer mistaken for function calls (`except (KeyError, TypeError):` was surfacing as an `unresolved-call` for `except`).
- Python `except` clauses that name specific exception types (e.g. `except (ValueError, TypeError): pass`) are now reported as `info`/`narrow` rather than a `warn`-level `empty-catch`. These are the deliberate EAFP fallback idiom (`try int / except: pass / try float`), not blanket error-swallowing. Bare `except:` and the catch-alls `except Exception:` / `except BaseException:` stay at `warn`.
- Python relative imports of sibling packages and modules (`from .core import …`, `from .notebook import …`) no longer raise `broken-import` false positives. Leading import dots are now treated as package-level markers (one dot = the importer's own package, N dots = N-1 levels up) rather than literal path segments, so they resolve to `core/__init__.py` / `notebook.py` as Python intends. Applies to both the import-graph and the smell detector.
- trace: branch expansion is now recursive — `+N` badges keep appearing past depth 2, so you can walk a chain start-to-end. Underlying tree depth bumped from 6 to 20.
- fix(trace): re-rooting (single-click) and back/forward history no longer wipe `expandedTraceBranches`. Expansions are keyed by fnKey, so keeping them across re-roots preserves what the user already opened; irrelevant keys are simply ignored.
- fix(workspace): the back-stack breadcrumb no longer truncates to the last 3 entries. Earlier steps stayed in `STATE.history` but were sliced out of the rendered trail; now the full chain is rendered and scrolls horizontally when long.
- trace: single-click any function in the trace map to re-root on it (was double-click). The map now shows only the root and its direct callees by default; deeper branches are collapsed with a `+N` badge you can click to reveal one more level.
- trace: trace-map and Calls-panel clicks always extend the breadcrumb, including re-clicks of the current function. Sidebar/file selection still doesn't touch the trace trail — it's a tracing trail, not a selection log.
- fix(workspace): function "Calls" panel was rendering blank after the trace-map signature change; both call sites now use the new `(tree, onSetRoot, onToggleBranch, expandedBranches)` shape.
- fix(tests): `python: complex type annotations survive comma split` used a single-letter `def f(...)`, which the parser intentionally skips (2-char minimum); switched to `def fn(...)` so the test exercises what it claims to.
- fix(parser): function-body extraction now spans blank lines and stops at dedent instead of the first blank line, so calls past the docstring (e.g. `execute_tool` → `handle_list`, `handle_count`) are detected.
- nav: back button + breadcrumb across workspace and overlay handoffs (Backspace / Alt+← also work).
- ui: README, file-level docs, and function docstrings now surface in Repo / file / function summaries.
- ui: Source view is now interactive — call sites and import lines link to their definitions, with a hover popover showing identity and "Open Flow".
- flow: new Flow mode on functions — params, returns, effects (read/write split), and the actual argument expressions every caller passes in.
- Add MIT `LICENSE` and a License section in the README.
- Add a "Try it live" link to the README and a `.nojekyll` file so the app can be served from GitHub Pages.
- Bring `docs/design.md` current to the v3 single-workspace UI (toolbar, navigator, workspace detail modes, Walk/Graph/Smells overlays, effects badges, path painter, git-URL modal, help panel); the old v2 tabbed spec is gone.
- Parser now harvests function parameter names from signatures (including Go receiver-style `func (recv) Name(args)` and JS arrow / destructured forms) and excludes them from the call-name set, so framework-injected params like Starlette's `call_next` or Express's `next` no longer surface as `unresolved-call` false positives.
- Load a GitHub or GitLab repo straight from a URL via the new toolbar "Load URL" button. Fetching happens client-side against the host's REST API; optional personal access token raises GitHub's 60/hr anonymous limit to 5000/hr (token kept in `sessionStorage` only). Capped at 500 files per repo to keep parsing under the documented perf target.
- Toolbar logo now shows an icon and acts as a "back to repo overview" button on every page (including Walk, Graph, and Smells overlays).
- Risk rows are collapsible — only the location/kind shows by default; click to expand snippet and rationale. Applies to both the workspace Risk view and the full-screen Smells overlay.
- Repo overview uses the full workspace pane width instead of being capped at 1100px.
- Stop tracking `docs/plans/`; only `docs/design.md` is versioned.
- Add this changelog and reference it from the README.
- Document the post-change workflow (commit message + changelog + docs) in `CLAUDE.md`.

## 2026-05 — UI rework: single workspace

- Single two-pane workspace replaces tabbed views; sticky detail modes
  (Summary / Source / Calls / Risk / Deps).
- Repo overview card with line / function / complexity / language charts.
- Walk view reworked into master/detail; broader DB heuristics.
- Smells export for LLM consumption.
- Graph and Walk fixes; brace-aware body slicing handles one-liners and Python.
- In-app glossary; tightened body slice for effect detection.

## 2026-05 — Phase 9: trust & effect tracing

- Per-function effect tagging (`net · fs · db · exec · dom · env`) via
  import + pattern detection with reverse-BFS propagation.
- Five smell detectors: hallucinated calls, broken imports, suspicious
  comments, swallowed catches, placeholders.
- Path painter on the graph (start/end, forward/reverse reach).
- String-aware comment stripping; failing-test fixes.

## 2026-04 — Earlier phases

- Phase 8 plan: history & memory (snapshots, annotations, git-aware risk).
- Execution-path visualization; file-trace graph refocus.
- Preserved directory structure; function source view.
- Expanded `LANG_CONFIG` (HTML, CSS, common file types); URL-shaped imports
  skipped.
- Initial staged plan; deterministic walk-step generator; canvas dep graph;
  language-agnostic regex parser.
