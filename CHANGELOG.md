# Changelog

All notable changes to Codemap are recorded here. Newest first.

## Unreleased

- Add **History** overlay: drop a `git log --numstat` export alongside the repo to see commits, authors, monthly activity, and most-churned files. Toolbar shows an `⏱ history` button when stats are loaded; press `4` to toggle.
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
