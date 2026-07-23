// Pure, DOM-free. Turns analyzed STATE + a set of paths (a specy-road task's
// touch_zones) into a deterministic, task-scoped code-intelligence packet.
// No LLM, no I/O, no randomness. See docs/plans/2026-07-23-specy-road-*.
import { fnKey, fnNameFromKey } from './trace-graph.js';
import { dismissKey } from './triage.js';
import { KIND_DESCRIPTIONS } from './smells-export.js';

const HOTSPOT_CX = 7;

const strip = s => String(s || '').replace(/^\/+|\/+$/g, '');

// A file belongs to a zone when the zone matches a segment-boundary sub-path of
// the file path. Handles the drag-drop root prefix ("repo/src/api" ⊇ "src/api").
export function fileMatchesZone(path, zone) {
  const p = strip(path), z = strip(zone);
  if (!z) return false;
  if (p === z) return true;
  if (p.startsWith(z + '/')) return true;
  if (p.endsWith('/' + z)) return true;
  return p.includes('/' + z + '/');
}

// Empty/absent zones ⇒ whole repo.
export function matchesAnyZone(path, zones) {
  if (!zones || !zones.length) return true;
  return zones.some(z => fileMatchesZone(path, z));
}

export function packetModel(state, { paths = [] } = {}) {
  const zones = (paths || []).map(strip).filter(Boolean);
  const files = state.files.filter(f => matchesAnyZone(f.path, zones));
  const inScope = new Set(files.map(f => f.path));

  const langs = [...new Set(files.map(f => f.lang))].sort();
  const matched = [...inScope].sort();

  // Findings: scoped + not dismissed, in the smells module's canonical order.
  const dismissed = state.dismissedSmells || new Set();
  const findings = (state.smells || [])
    .filter(s => inScope.has(s.file) && !dismissed.has(dismissKey(s)));
  const kindCounts = new Map();
  for (const s of findings) kindCounts.set(s.kind, (kindCounts.get(s.kind) || 0) + 1);
  const byKind = [...kindCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // Functions defined in scoped files, with their call-graph neighborhood.
  const fnList = files.flatMap(f => f.fns.map(fn => ({ fn, key: fnKey(fn) })));
  fnList.sort((a, b) => a.fn.file.localeCompare(b.fn.file) || a.fn.lineNum - b.fn.lineNum);
  const fns = fnList.map(({ fn, key }) => ({
    key, name: fn.name, file: fn.file, lineNum: fn.lineNum, cx: fn.cx,
    fanIn: state.fanIn.get(key) || 0,
    fanOut: state.fanOut.get(key) || 0,
    callers: (state.callersByFn.get(key) || [])
      .map(c => ({ name: fnNameFromKey(c.from), file: c.fromFile, confidence: c.confidence, ambiguous: c.ambiguous }))
      .sort(byNameFile),
    callees: (state.callsByFn.get(key) || [])
      .map(e => ({ name: e.name, resolved: e.resolved, confidence: e.confidence, ambiguous: e.ambiguous }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  // Edges that cross the scope boundary, deduped and sorted.
  const scopedKeys = new Set(fnList.map(x => x.key));
  const crossSeen = new Set();
  const crossEdges = [];
  for (const e of (state.callEdges || [])) {
    const inFrom = scopedKeys.has(e.from), inTo = scopedKeys.has(e.to);
    if (inFrom === inTo) continue;               // wholly inside or wholly outside
    const direction = inFrom ? 'out' : 'in';
    const sig = `${e.from}|${e.to}`;
    if (crossSeen.has(sig)) continue;
    crossSeen.add(sig);
    crossEdges.push({ from: e.from, to: e.to, direction, confidence: e.confidence });
  }
  crossEdges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const hotspots = fns
    .filter(fn => fn.cx >= HOTSPOT_CX)
    .map(fn => ({ key: fn.key, name: fn.name, file: fn.file, cx: fn.cx, fanIn: fn.fanIn,
                  score: fn.cx * (1 + fn.fanIn) }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));

  return {
    repo: { fileCount: state.files.length, langs, zones, matched },
    files: files.map(f => ({
      path: f.path, lang: f.lang, lineCount: f.lineCount, cx: f.cx,
      libs: [...new Set((f.imports || []).map(i => i.lib))].sort(),
    })),
    findings, byKind, fns, crossEdges, hotspots,
  };
}

function byNameFile(a, b) {
  return a.name.localeCompare(b.name) || String(a.file).localeCompare(String(b.file));
}

export function renderMarkdown(model) {
  const L = [];
  const { repo } = model;
  L.push('# Codemap task context');
  L.push('');
  L.push('Deterministic, regex-based code intelligence from [Codemap](https://github.com/mikylabowen/CodeMap) — a browser-native, zero-LLM scanner. Use this as context to review or refactor the task below. Findings are heuristic; some are false positives — say so when they are.');
  L.push('');
  L.push('## Scope');
  L.push(`- Touch zones: ${repo.zones.length ? repo.zones.map(z => `\`${z}\``).join(', ') : '(whole repo)'}`);
  L.push(`- Files in scope: ${repo.matched.length} of ${repo.fileCount}`);
  L.push(`- Languages: ${repo.langs.join(', ') || 'unknown'}`);
  if (!repo.matched.length) {
    L.push('');
    L.push(`> No files matched ${repo.zones.map(z => `\`${z}\``).join(', ') || '(none)'}. Nothing to report.`);
    L.push('');
    return L.join('\n');
  }
  L.push('');
  L.push('## Files');
  L.push('');
  for (const f of model.files) {
    L.push(`- \`${f.path}\` — ${f.lang}, ${f.lineCount} lines, avg cx ${f.cx}${f.libs.length ? `; imports: ${f.libs.join(', ')}` : ''}`);
  }
  L.push('');

  L.push('## Findings');
  if (!model.findings.length) {
    L.push('');
    L.push('No heuristic findings in scope.');
  } else {
    L.push(`Total: ${model.findings.length}${model.byKind.length ? ` (${model.byKind.map(([k, n]) => `${k}=${n}`).join(', ')})` : ''}`);
    L.push('');
    L.push('Heuristic glossary:');
    for (const [kind] of model.byKind) {
      L.push(`- **${kind}** — ${KIND_DESCRIPTIONS[kind] || '(no description)'}`);
    }
    L.push('');
    model.findings.forEach((s, i) => {
      L.push(`### ${i + 1}. ${s.file}:${s.line} — ${s.kind}${s.subkind ? ` / ${s.subkind}` : ''}`);
      L.push(`- Severity: ${s.severity}`);
      if (s.fnName) L.push(`- Function: \`${s.fnName}()\``);
      if (s.why) L.push(`- Why flagged: ${s.why}`);
      if (s.snippet) { L.push('- Snippet:'); L.push('  ```'); L.push(`  ${s.snippet.replace(/\n/g, '\n  ')}`); L.push('  ```'); }
      L.push('');
    });
  }

  if (model.hotspots.length) {
    L.push('## Complexity hotspots');
    L.push('');
    for (const h of model.hotspots) {
      L.push(`- \`${h.name}()\` in \`${h.file}\` — cx ${h.cx}, fan-in ${h.fanIn} (score ${h.score})`);
    }
    L.push('');
  }

  L.push('## Call graph (scope neighborhood)');
  L.push('');
  L.push('Regex-inferred; `?` marks unresolved or ambiguous calls.');
  L.push('');
  for (const fn of model.fns) {
    const callees = fn.callees.map(c => c.resolved && !c.ambiguous ? c.name : `${c.name}?`);
    const callers = fn.callers.map(c => c.name);
    L.push(`- \`${fn.name}()\` (\`${fn.file}\`) — fan-in ${fn.fanIn}, fan-out ${fn.fanOut}`);
    if (callers.length) L.push(`  - called by: ${callers.join(', ')}`);
    if (callees.length) L.push(`  - calls: ${callees.join(', ')}`);
  }
  L.push('');

  L.push('## Task');
  L.push('For each finding: decide **fix**, **false positive**, or **needs human judgement**. For real issues, propose a minimal fix as a unified diff against the named file. Group output by file.');
  L.push('');
  return L.join('\n');
}

export function contextPacket(state, { paths = [], format = 'md' } = {}) {
  const model = packetModel(state, { paths });
  if (format === 'toon') return renderToon(model);   // added in Task 3
  return renderMarkdown(model);
}

export function renderToon(model) { return renderMarkdown(model); }
