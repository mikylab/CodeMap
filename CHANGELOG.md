# Changelog

All notable changes to Codemap are recorded here. Newest first.

## Unreleased

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
