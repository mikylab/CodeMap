// Browser entry point for the task-context export. Reads STATE, calls the pure
// contextPacket() core, and hands the result off via clipboard/download. All
// text goes through el()'s textContent — never innerHTML.
import { STATE } from './state.js';
import { el } from './dom.js';
import { contextPacket, matchesAnyZone } from './context-packet.js';

function parseZones(raw) {
  return String(raw || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
}

function matchCount(zones) {
  return STATE.files.filter(f => matchesAnyZone(f.path, zones)).length;
}

function flash(btn, text) {
  const original = btn.textContent;
  btn.textContent = text; btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
}

export function contextExportBar() {
  const wrap = el('div', { cls: 'smell-export-bar ctx-export-bar' });
  wrap.appendChild(el('span', { cls: 'smell-export-label', text: 'Task context (specy-road / agent):' }));

  const zonesInput = el('textarea', {
    cls: 'ctx-zones', attrs: { rows: '1', placeholder: 'touch_zones — e.g. src/api, routes (blank = whole repo)' },
    title: 'Paths this task touches. Comma- or newline-separated; blank means the whole repo.',
  });

  let format = 'md';
  const fmtBtn = el('button', { cls: 'smell-export-btn', type: 'button', text: 'Format: Markdown', title: 'Toggle output format' });
  fmtBtn.addEventListener('click', () => {
    format = format === 'md' ? 'toon' : 'md';
    fmtBtn.textContent = `Format: ${format === 'md' ? 'Markdown' : 'TOON'}`;
    refresh();
  });

  // Budget controls. An unbounded packet on a wide scope runs to tens of
  // thousands of tokens, so the cost is shown live and can be capped here.
  let minSeverity = 'info';
  const sevBtn = el('button', { cls: 'smell-export-btn', type: 'button', text: 'Severity: all', title: 'Include info findings, or warnings only' });
  sevBtn.addEventListener('click', () => {
    minSeverity = minSeverity === 'info' ? 'warn' : 'info';
    sevBtn.textContent = `Severity: ${minSeverity === 'info' ? 'all' : 'warn+'}`;
    refresh();
  });

  const CALL_MODES = ['all', 'adjacent', 'none'];
  let callGraph = 'all';
  const cgBtn = el('button', { cls: 'smell-export-btn', type: 'button', text: 'Call graph: all', title: 'Full call graph, only functions the packet already mentions, or none' });
  cgBtn.addEventListener('click', () => {
    callGraph = CALL_MODES[(CALL_MODES.indexOf(callGraph) + 1) % CALL_MODES.length];
    cgBtn.textContent = `Call graph: ${callGraph}`;
    refresh();
  });

  const maxInput = el('input', {
    cls: 'ctx-max', attrs: { type: 'number', min: '0', step: '10', value: '0', title: 'Max findings (0 = no cap)' },
  });
  maxInput.addEventListener('input', refresh);

  function currentOpts() {
    return {
      paths: parseZones(zonesInput.value), format, minSeverity, callGraph,
      maxFindings: Math.max(0, Number(maxInput.value) || 0),
    };
  }

  const count = el('span', { cls: 'smell-export-count', text: '' });
  function refresh() {
    const opts = currentOpts();
    const files = matchCount(opts.paths);
    // The estimate is a convenience, not the feature. It runs on every
    // keystroke and at construction, so a failure here must never take the
    // Smells view down with it — fall back to the plain file count.
    let approx = null;
    try { approx = Math.round(contextPacket(STATE, opts).length / 4); }
    catch (e) { console.warn('codemap: packet size estimate failed', e); }
    count.textContent = approx === null
      ? `${files} files matched`
      : `${files} files matched · ~${approx.toLocaleString()} tokens`;
  }
  zonesInput.addEventListener('input', refresh);

  const copyBtn = el('button', { cls: 'smell-export-btn', type: 'button', text: 'Copy packet', title: 'Copy the task-context packet to your clipboard' });
  copyBtn.addEventListener('click', async () => {
    const out = contextPacket(STATE, currentOpts());
    try { await navigator.clipboard.writeText(out); flash(copyBtn, 'Copied ✓'); }
    catch { flash(copyBtn, 'Copy failed'); }
  });

  const dlBtn = el('button', { cls: 'smell-export-btn', type: 'button', text: 'Download', title: 'Save the packet as a file for your repo’s planning/ dir' });
  dlBtn.addEventListener('click', () => {
    const opts = currentOpts();
    const zones = opts.paths;
    const out = contextPacket(STATE, opts);
    const ext = format === 'md' ? 'md' : 'toon';
    const slug = zones.length ? zones.join('-').replace(/[\\/]/g, '_') : 'repo';
    const mime = format === 'md' ? 'text/markdown' : 'text/plain';
    const blob = new Blob([out], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${slug}-codemap-context.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  wrap.appendChild(zonesInput);
  wrap.appendChild(fmtBtn);
  wrap.appendChild(sevBtn);
  wrap.appendChild(cgBtn);
  wrap.appendChild(el('label', { cls: 'ctx-max-label', text: 'Max findings' }, [maxInput]));
  wrap.appendChild(copyBtn);
  wrap.appendChild(dlBtn);
  wrap.appendChild(count);
  refresh();
  return wrap;
}
