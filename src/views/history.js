import { STATE, hasGitStats, selectFile } from '../state.js';
import { summarizeGitLog } from '../git-log.js';
import { el, basename } from '../dom.js';

let cachedSummary = null;
let cachedFor = null;

export function renderHistory(onChange) {
  const wrap = el('div', { cls: 'history-root' });
  if (!hasGitStats()) {
    wrap.appendChild(splash());
    return wrap;
  }
  if (cachedFor !== STATE.gitCommits) {
    cachedSummary = summarizeGitLog(STATE.gitCommits);
    cachedFor = STATE.gitCommits;
  }
  const summary = cachedSummary;
  wrap.appendChild(el('div', { cls: 'view-hint' }, [
    el('span', { cls: 'view-hint-name', text: 'History' }),
    el('span', { text: ' — Commits, authors, and churn from the git log you dropped. Click a file row to open it in the workspace.' }),
  ]));
  wrap.appendChild(summaryStrip(summary.totals));
  const grid = el('div', { cls: 'history-grid' });
  grid.appendChild(card('Top authors', authorList(summary.byAuthor)));
  grid.appendChild(card('Commits by month', monthChart(summary.byMonth)));
  grid.appendChild(card('Most-churned files', pathList(summary.topPaths, onChange)));
  grid.appendChild(card('Recent commits', commitList(summary.recent)));
  wrap.appendChild(grid);
  return wrap;
}

function splash() {
  return el('div', { cls: 'upload-splash' }, [
    el('div', { cls: 'splash-title', text: 'No git history loaded' }),
    el('div', { cls: 'splash-sub' }, [
      el('div', { text: 'Drop a file alongside the repo from:' }),
      el('pre', { cls: 'history-cmd', text: "git log --numstat --pretty=format:'__commit__%n%H%n%aI%n%ae%n%s' > codemap-history.txt" }),
    ]),
  ]);
}

function summaryStrip(t) {
  const span = t.firstTs && t.lastTs ? `${fmtDate(t.firstTs)} → ${fmtDate(t.lastTs)}` : '—';
  const cells = [
    ['Commits',  String(t.commits)],
    ['Authors',  String(t.authors)],
    ['Files',    String(t.files)],
    ['Span',     span],
    ['Added',    `+${t.linesAdded.toLocaleString()}`],
    ['Removed',  `−${t.linesRemoved.toLocaleString()}`],
  ];
  const strip = el('div', { cls: 'history-strip' });
  for (const [lbl, val] of cells) {
    strip.appendChild(el('div', { cls: 'history-stat' }, [
      el('div', { cls: 'history-stat-val', text: val }),
      el('div', { cls: 'history-stat-lbl', text: lbl }),
    ]));
  }
  return strip;
}

function card(title, body) {
  return el('div', { cls: 'ov-card history-card' }, [
    el('div', { cls: 'ov-title', text: title }),
    body,
  ]);
}

function authorList(rows) {
  if (!rows.length) return el('div', { cls: 'sb-empty', text: 'no authors' });
  const max = rows[0].commits || 1;
  const wrap = el('div', { cls: 'bar-rows' });
  for (const r of rows.slice(0, 12)) {
    wrap.appendChild(barRow(shortAuthor(r.author), r.author, r.commits, max, 'var(--accent)'));
  }
  return wrap;
}

function pathList(rows, onChange) {
  if (!rows.length) return el('div', { cls: 'sb-empty', text: 'no files' });
  const max = rows[0].commits || 1;
  const wrap = el('div', { cls: 'bar-rows' });
  for (const r of rows) {
    const row = barRow(basename(r.path), r.path, r.commits, max, 'var(--warn)');
    row.classList.add('history-clickable');
    row.addEventListener('click', () => {
      if (STATE.byPath.has(r.path)) { selectFile(r.path); onChange(); }
    });
    wrap.appendChild(row);
  }
  return wrap;
}

function barRow(label, titleText, value, max, color) {
  const fill = el('div', { cls: 'bar-fill', style: { width: ((value / max) * 100) + '%', background: color } });
  return el('div', { cls: 'bar-row' }, [
    el('div', { cls: 'bar-label', text: label, title: titleText }),
    el('div', { cls: 'bar-track' }, [fill]),
    el('div', { cls: 'bar-count', text: String(value) }),
  ]);
}

function monthChart(rows) {
  if (!rows.length) return el('div', { cls: 'sb-empty', text: 'no dated commits' });
  const max = Math.max(...rows.map(r => r.commits)) || 1;
  const wrap = el('div', { cls: 'history-spark' });
  for (const r of rows) {
    wrap.appendChild(el('div', {
      cls: 'history-spark-bar',
      title: `${r.month}: ${r.commits} commit${r.commits === 1 ? '' : 's'} (+${r.linesAdded} −${r.linesRemoved})`,
      style: { height: Math.max(2, Math.round((r.commits / max) * 100)) + '%' },
    }));
  }
  return wrap;
}

function commitList(rows) {
  if (!rows.length) return el('div', { cls: 'sb-empty', text: 'no commits' });
  const wrap = el('div', { cls: 'history-commits' });
  for (const c of rows) {
    wrap.appendChild(el('div', { cls: 'history-commit' }, [
      el('div', { cls: 'history-commit-date', text: fmtDate(c.ts) }),
      el('div', { cls: 'history-commit-hash', text: (c.hash || '').slice(0, 7) }),
      el('div', { cls: 'history-commit-subj', text: c.subject || '(no subject)', title: c.subject || '' }),
      el('div', { cls: 'history-commit-author', text: shortAuthor(c.author), title: c.author }),
    ]));
  }
  return wrap;
}

function shortAuthor(a) {
  if (!a) return '—';
  const at = a.indexOf('@');
  return at > 0 ? a.slice(0, at) : a;
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}
