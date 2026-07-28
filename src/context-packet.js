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

// Budget knobs. Defaults reproduce the uncapped packet exactly, so an
// unconfigured call behaves as it always has.
export const DEFAULT_LIMITS = {
  minSeverity: 'info',   // 'info' = everything; 'warn' = warnings only
  maxFindings: 0,        // 0 = unlimited
  snippetChars: 0,       // 0 = full snippet; -1 = omit snippets entirely
  callGraph: 'all',      // 'all' | 'adjacent' | 'none'
};

const SEVERITY_RANK = { info: 0, warn: 1 };

function normalizeLimits(opts = {}) {
  const l = { ...DEFAULT_LIMITS, ...opts };
  if (!(l.minSeverity in SEVERITY_RANK)) l.minSeverity = DEFAULT_LIMITS.minSeverity;
  if (!['all', 'adjacent', 'none'].includes(l.callGraph)) l.callGraph = DEFAULT_LIMITS.callGraph;
  l.maxFindings = Math.max(0, Number(l.maxFindings) || 0);
  l.snippetChars = Number(l.snippetChars) || 0;
  return l;
}

function clipSnippet(snippet, chars) {
  if (chars < 0) return '';
  const s = String(snippet || '');
  if (!chars || s.length <= chars) return s;
  return s.slice(0, chars) + '…';
}

export function packetModel(state, { paths = [], ...limitOpts } = {}) {
  const limits = normalizeLimits(limitOpts);
  const zones = (paths || []).map(strip).filter(Boolean);
  const allFiles = (state && state.files) || [];
  const files = allFiles.filter(f => matchesAnyZone(f.path, zones));
  const inScope = new Set(files.map(f => f.path));

  const langs = [...new Set(files.map(f => f.lang))].sort();
  const matched = [...inScope].sort();

  // Findings: scoped + not dismissed, in the smells module's canonical order
  // (which is already warn-before-info), then severity-filtered and capped.
  const dismissed = state.dismissedSmells || new Set();
  const kept = (state.smells || [])
    .filter(s => inScope.has(s.file) && !dismissed.has(dismissKey(s)));
  const dismissedCount = (state.smells || [])
    .filter(s => inScope.has(s.file) && dismissed.has(dismissKey(s))).length;
  const minRank = SEVERITY_RANK[limits.minSeverity];
  const eligible = kept.filter(s => (SEVERITY_RANK[s.severity] ?? 0) >= minRank);
  const findings = (limits.maxFindings ? eligible.slice(0, limits.maxFindings) : eligible)
    .map(s => (limits.snippetChars ? { ...s, snippet: clipSnippet(s.snippet, limits.snippetChars) } : s));
  const budget = {
    total: kept.length,
    shown: findings.length,
    droppedBySeverity: kept.length - eligible.length,
    droppedByCap: eligible.length - findings.length,
    dismissed: dismissedCount,
  };
  const kindCounts = new Map();
  for (const s of findings) kindCounts.set(s.kind, (kindCounts.get(s.kind) || 0) + 1);
  const byKind = [...kindCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // Functions defined in scoped files, with their call-graph neighborhood.
  // The call-graph maps are absent on a parse-only state (and while the UI is
  // still mid-load), so degrade to an empty neighborhood rather than throwing —
  // same graceful-degradation contract the walker follows.
  const NONE = new Map();
  const fanInMap = state.fanIn || NONE;
  const fanOutMap = state.fanOut || NONE;
  const callersMap = state.callersByFn || NONE;
  const calleesMap = state.callsByFn || NONE;
  const fnList = files.flatMap(f => (f.fns || []).map(fn => ({ fn, key: fnKey(fn) })));
  fnList.sort((a, b) => a.fn.file.localeCompare(b.fn.file) || a.fn.lineNum - b.fn.lineNum);
  const fns = fnList.map(({ fn, key }) => ({
    key, name: fn.name, file: fn.file, lineNum: fn.lineNum, cx: fn.cx,
    fanIn: fanInMap.get(key) || 0,
    fanOut: fanOutMap.get(key) || 0,
    callers: (callersMap.get(key) || [])
      .map(c => ({ name: fnNameFromKey(c.from), file: c.fromFile, confidence: c.confidence, ambiguous: c.ambiguous }))
      .sort(byNameFile),
    callees: (calleesMap.get(key) || [])
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

  // The call-graph section is the largest part of a wide packet, so it can be
  // narrowed to the functions the rest of the packet already talks about, or
  // dropped. Hotspots and boundary edges are computed from the full set above,
  // so narrowing here never changes them.
  const adjacent = new Set();
  if (limits.callGraph === 'adjacent') {
    for (const h of hotspots) adjacent.add(h.key);
    for (const e of crossEdges) { adjacent.add(e.from); adjacent.add(e.to); }
    for (const s of findings) {
      if (!s.fnName) continue;
      for (const fn of fns) if (fn.file === s.file && fn.name === s.fnName) adjacent.add(fn.key);
    }
  }
  const shownFns = limits.callGraph === 'all' ? fns
    : limits.callGraph === 'none' ? []
    : fns.filter(fn => adjacent.has(fn.key));

  return {
    repo: { fileCount: allFiles.length, langs, zones, matched },
    files: files.map(f => ({
      path: f.path, lang: f.lang, lineCount: f.lineCount, cx: f.cx,
      libs: [...new Set((f.imports || []).map(i => i.lib))].sort(),
    })),
    findings, byKind, fns: shownFns, crossEdges, hotspots,
    limits, budget: { ...budget, fnsTotal: fns.length, fnsShown: shownFns.length },
  };
}

function byNameFile(a, b) {
  return a.name.localeCompare(b.name) || String(a.file).localeCompare(String(b.file));
}

// A capped packet must say what it left out — otherwise a truncated list reads
// as "this is everything", which is exactly the wrong thing to tell an agent.
export function omissionNotes(model) {
  const b = model.budget || {};
  const out = [];
  if (b.droppedBySeverity) {
    out.push(`- ${b.droppedBySeverity} finding(s) below severity \`${model.limits.minSeverity}\` omitted.`);
  }
  if (b.droppedByCap) {
    out.push(`- ${b.droppedByCap} further finding(s) omitted by the max-findings cap (${model.limits.maxFindings}); the most severe are shown first.`);
  }
  if (b.dismissed) {
    out.push(`- ${b.dismissed} finding(s) previously triaged as false positives and excluded. Do not re-report them.`);
  }
  return out;
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
    for (const line of omissionNotes(model)) L.push(line);
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

  if (model.limits.callGraph !== 'none') {
    L.push('## Call graph (scope neighborhood)');
    L.push('');
    L.push('Regex-inferred; `?` marks unresolved or ambiguous calls.');
    if (model.limits.callGraph === 'adjacent') {
      L.push('');
      L.push(`Narrowed to the ${model.budget.fnsShown} of ${model.budget.fnsTotal} scoped function(s) that carry a finding, are a complexity hotspot, or touch the scope boundary.`);
    }
    L.push('');
    for (const fn of model.fns) {
      const callees = fn.callees.map(c => c.resolved && !c.ambiguous ? c.name : `${c.name}?`);
      const callers = fn.callers.map(c => c.name);
      L.push(`- \`${fn.name}()\` (\`${fn.file}\`) — fan-in ${fn.fanIn}, fan-out ${fn.fanOut}`);
      if (callers.length) L.push(`  - called by: ${callers.join(', ')}`);
      if (callees.length) L.push(`  - calls: ${callees.join(', ')}`);
    }
    L.push('');
  }

  if (model.crossEdges.length) {
    L.push('## Boundary calls');
    L.push('');
    L.push('Calls crossing the task\'s scope boundary (regex-inferred; `in` = outside code calls into scope, `out` = scope calls outside; confidence shown).');
    L.push('');
    for (const e of model.crossEdges) {
      L.push(`- ${e.direction}: \`${fnNameFromKey(e.from)}\` → \`${fnNameFromKey(e.to)}\` (${e.confidence})`);
    }
    L.push('');
  }

  L.push('## Task');
  L.push('For each finding: decide **fix**, **false positive**, or **needs human judgement**. For real issues, propose a minimal fix as a unified diff against the named file. Group output by file.');
  L.push('');
  return L.join('\n');
}

export function contextPacket(state, { paths = [], format = 'md', ...limitOpts } = {}) {
  const model = packetModel(state, { paths, ...limitOpts });
  if (format === 'toon') return renderToon(model);   // added in Task 3
  return renderMarkdown(model);
}

// Minimal, deterministic TOON encoder for our packet model. No dependency.
// - array of uniform objects  -> `key[N]{col,col}:` header + one comma row per item
// - array of scalars          -> `key[N]: a,b,c`
// - object                    -> `key:` then indented children
// - scalar                    -> `key: value`
export function renderToon(model) {
  const b = model.budget;
  const doc = {
    scope: {
      zones: model.repo.zones,
      filesInScope: model.repo.matched.length,
      totalFiles: model.repo.fileCount,
      languages: model.repo.langs,
    },
    // Mirrors the markdown omission notes: a capped packet must not read as complete.
    omitted: {
      findingsShown: b.shown,
      findingsTotal: b.total,
      belowMinSeverity: b.droppedBySeverity,
      overCap: b.droppedByCap,
      triagedFalsePositives: b.dismissed,
      note: b.dismissed ? 'triaged findings are excluded — do not re-report them' : '',
    },
    files: model.files.map(f => ({ path: f.path, lang: f.lang, lines: f.lineCount, cx: f.cx, libs: f.libs.join('|') })),
    findings: model.findings.map(s => ({
      file: s.file, line: s.line, kind: s.kind, subkind: s.subkind || '',
      severity: s.severity, fn: s.fnName || '', why: s.why || '',
    })),
    hotspots: model.hotspots.map(h => ({ fn: h.name, file: h.file, cx: h.cx, fanIn: h.fanIn, score: h.score })),
    functions: model.fns.map(fn => ({
      fn: fn.name, file: fn.file, fanIn: fn.fanIn, fanOut: fn.fanOut,
      calls: fn.callees.map(c => (c.resolved && !c.ambiguous) ? c.name : c.name + '?').join('|'),
    })),
    boundaryEdges: model.crossEdges.map(e => ({
      direction: e.direction, from: fnNameFromKey(e.from), to: fnNameFromKey(e.to), confidence: e.confidence,
    })),
  };
  return toonEncode(doc, 0).join('\n') + '\n';
}

function toonScalar(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  // Quote when a comma/newline would break the tabular row grammar.
  return /[,\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function toonEncode(node, depth) {
  const pad = '  '.repeat(depth);
  const lines = [];
  for (const [key, val] of Object.entries(node)) {
    if (Array.isArray(val)) {
      if (val.length && val.every(isPlainObject)) {
        const cols = Object.keys(val[0]);
        lines.push(`${pad}${key}[${val.length}]{${cols.join(',')}}:`);
        for (const row of val) lines.push(`${pad}  ${cols.map(c => toonScalar(row[c])).join(',')}`);
      } else if (val.length) {
        lines.push(`${pad}${key}[${val.length}]: ${val.map(toonScalar).join(',')}`);
      } else {
        lines.push(`${pad}${key}[0]:`);
      }
    } else if (isPlainObject(val)) {
      lines.push(`${pad}${key}:`);
      lines.push(...toonEncode(val, depth + 1));
    } else {
      lines.push(`${pad}${key}: ${toonScalar(val)}`);
    }
  }
  return lines;
}
