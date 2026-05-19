# Changelog

All notable changes to Codemap are recorded here. Newest first.

## Unreleased

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
