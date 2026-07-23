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
    cls: 'ctx-zones', attrs: { rows: '1', placeholder: 'touch_zones — e.g. src/api, routes/entries (blank = whole repo)' },
  });

  let format = 'md';
  const fmtBtn = el('button', { cls: 'smell-export-btn', type: 'button', text: 'Format: Markdown', title: 'Toggle output format' });
  fmtBtn.addEventListener('click', () => {
    format = format === 'md' ? 'toon' : 'md';
    fmtBtn.textContent = `Format: ${format === 'md' ? 'Markdown' : 'TOON'}`;
  });

  const count = el('span', { cls: 'smell-export-count', text: `${matchCount([])} files matched` });
  zonesInput.addEventListener('input', () => {
    count.textContent = `${matchCount(parseZones(zonesInput.value))} files matched`;
  });

  const copyBtn = el('button', { cls: 'smell-export-btn', type: 'button', text: 'Copy packet', title: 'Copy the task-context packet to your clipboard' });
  copyBtn.addEventListener('click', async () => {
    const out = contextPacket(STATE, { paths: parseZones(zonesInput.value), format });
    try { await navigator.clipboard.writeText(out); flash(copyBtn, 'Copied ✓'); }
    catch { flash(copyBtn, 'Copy failed'); }
  });

  const dlBtn = el('button', { cls: 'smell-export-btn', type: 'button', text: 'Download', title: 'Save the packet as a file for your repo’s planning/ dir' });
  dlBtn.addEventListener('click', () => {
    const zones = parseZones(zonesInput.value);
    const out = contextPacket(STATE, { paths: zones, format });
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
  wrap.appendChild(copyBtn);
  wrap.appendChild(dlBtn);
  wrap.appendChild(count);
  return wrap;
}
