import { STATE } from './state.js';
import { el } from './dom.js';

const KIND_DESCRIPTIONS = {
  'unresolved-call':    'Call to a name that no in-codebase function defines and no import provides — possibly hallucinated, dead, or relying on an undocumented global.',
  'broken-import':      'Import path that does not resolve to any file in the repo and is not a known stdlib / external dependency.',
  'suspicious-comment': 'Comment containing TODO/FIXME/HACK/XXX or similar — flag for follow-up.',
  'empty-catch':        'Catch/except block that swallows the error without logging or re-raising — silent failures hide bugs.',
  'placeholder':        'Placeholder/stub left in code: `pass`, `NotImplementedError`, `throw new Error("not implemented")`, etc.',
};

export function smellExportBar(smells, slug) {
  const wrap = el('div', { cls: 'smell-export-bar' });
  wrap.appendChild(el('span', { cls: 'smell-export-label', text: 'Hand off to an LLM:' }));

  const copyBtn = el('button', {
    cls: 'smell-export-btn', type: 'button',
    text: 'Copy prompt',
    title: 'Copy a markdown brief of these findings to your clipboard',
  });
  copyBtn.addEventListener('click', async () => {
    const md = buildPrompt(smells);
    try {
      await navigator.clipboard.writeText(md);
      flashLabel(copyBtn, 'Copied ✓');
    } catch (_) {
      flashLabel(copyBtn, 'Copy failed');
    }
  });
  wrap.appendChild(copyBtn);

  const dlBtn = el('button', {
    cls: 'smell-export-btn', type: 'button',
    text: 'Download .md',
    title: 'Save the prompt as a markdown file',
  });
  dlBtn.addEventListener('click', () => {
    const md = buildPrompt(smells);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codemap-smells-${slug || 'export'}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  wrap.appendChild(dlBtn);

  wrap.appendChild(el('span', { cls: 'smell-export-count',
    text: `${smells.length} finding${smells.length === 1 ? '' : 's'}` }));
  return wrap;
}

function flashLabel(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
}

function buildPrompt(smells) {
  const lines = [];
  const fileCount = STATE.files.length;
  const langs = new Set(STATE.files.map(f => f.lang));
  const byKind = new Map();
  for (const s of smells) byKind.set(s.kind, (byKind.get(s.kind) || 0) + 1);

  lines.push('# Code review request — Codemap smell findings');
  lines.push('');
  lines.push('You are reviewing a codebase that I just scanned with [Codemap](https://github.com/), a deterministic browser-native scanner. Below are heuristic findings. Your job: triage each one, then propose a concrete fix as a unified diff (or explain why it is a false positive).');
  lines.push('');
  lines.push('## Repo context');
  lines.push(`- Files scanned: ${fileCount}`);
  lines.push(`- Languages: ${[...langs].sort().join(', ') || 'unknown'}`);
  lines.push(`- Findings included: ${smells.length}`);
  if (byKind.size) {
    lines.push(`- By kind: ${[...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(', ')}`);
  }
  lines.push('');
  lines.push('## Heuristic glossary');
  lines.push('Codemap is regex-based and intentionally noisy. Some findings are false positives — say so when they are. Each kind means:');
  lines.push('');
  for (const kind of [...new Set(smells.map(s => s.kind))]) {
    const desc = KIND_DESCRIPTIONS[kind] || '(no description)';
    lines.push(`- **${kind}** — ${desc}`);
  }
  lines.push('');
  lines.push('## Findings');
  lines.push('');

  const sorted = smells.slice().sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'warn' ? -1 : 1;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });

  sorted.forEach((s, i) => {
    const head = `### ${i + 1}. ${s.file}:${s.line} — ${s.kind}${s.subkind ? ` / ${s.subkind}` : ''}`;
    lines.push(head);
    lines.push(`- **Severity**: ${s.severity}`);
    if (s.fnName) lines.push(`- **Function**: \`${s.fnName}()\``);
    if (s.why) lines.push(`- **Why flagged**: ${s.why}`);
    if (s.snippet) {
      lines.push('- **Snippet**:');
      lines.push('  ```');
      lines.push(`  ${s.snippet.replace(/\n/g, '\n  ')}`);
      lines.push('  ```');
    }
    lines.push('');
  });

  lines.push('## Instructions');
  lines.push('1. For each finding, decide: **fix**, **false positive**, or **needs human judgement**.');
  lines.push('2. For real issues, output a fix as a unified diff against the named file. Keep changes minimal.');
  lines.push('3. For false positives, explain the regex trigger and what real code pattern fooled the heuristic.');
  lines.push('4. Group your output by file so I can apply diffs in order.');
  lines.push('');
  return lines.join('\n');
}
