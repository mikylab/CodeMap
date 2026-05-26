import { STATE, closeHelp } from '../state.js';
import { el, clear } from '../dom.js';

export function renderHelp(onChange) {
  const root = document.getElementById('help-panel');
  if (!root) return;
  clear(root);
  if (!STATE.helpOpen) {
    root.style.display = 'none';
    return;
  }
  root.style.display = 'flex';

  const card = el('div', { cls: 'help-card' });
  card.appendChild(header(onChange));

  card.appendChild(section('Layout', [
    item('Top bar', 'Walk / Graph / Smells overlays + global filters.'),
    item('Navigator (left)', 'Pick a file or function. Search box matches both. Click ⌂ Repo for an overview.'),
    item('Detail (right)', 'Whatever you picked, shown five different ways: Summary, Source, Calls, Risk, Deps.'),
  ]));

  card.appendChild(section('Detail-pane modes', [
    item('Summary', 'The "what is this and why does it matter" view. Top callers/callees, smells, source preview.'),
    item('Source', 'Just the code, with line numbers.'),
    item('Calls', 'For a function: the full execution-map DAG of everything it calls. For a file: pick a fn.'),
    item('Risk', 'Smells (heuristic problems) detected in the selection.'),
    item('Deps', 'For a file: imports + importers. For the repo: every external/stdlib library.'),
  ]));

  card.appendChild(section('Abbreviations', [
    item('cx', 'Cyclomatic complexity — count of decision points (if/for/while/&&/||/?). Higher = harder to follow. Green ≤4, yellow 5–6, red ≥7.'),
    item('fn', 'Function (incl. methods, arrow fns, etc.).'),
    item('L', 'Line number — e.g. L42 means line 42 of the file.'),
    item('callers / fan-in', 'How many in-codebase functions call this one.'),
    item('calls / fan-out', 'How many distinct in-codebase functions this one calls.'),
    item('+N ext', 'External / library / unresolved calls (collapsed, not drawn in the trace map).'),
    item('reach', 'Total functions reachable from this entry, transitively.'),
    item('depth', 'Longest call chain from this entry.'),
  ]));

  card.appendChild(section('Effect tags', [
    item('NET', 'Network — fetches, HTTP clients, sockets.'),
    item('FS',  'Filesystem — reading or writing files.'),
    item('DB',  'Database — SQL, ORMs, key-value stores.'),
    item('EXEC','Subprocess / shell — spawning other programs.'),
    item('DOM', 'Browser DOM — document.*, window.*, etc.'),
    item('ENV', 'Environment — process.env, os.environ, etc.'),
    note('Solid pill = the function does this directly. Outlined pill = a function it calls (transitively) does it.'),
  ]));

  card.appendChild(section('Smells', [
    item('hallucinated', 'A call site whose name has no definition or import in the repo. Common in LLM-generated code.'),
    item('broken-import', 'A relative import path that resolves to nothing.'),
    item('suspicious', 'Comment markers like TODO / FIXME / HACK / "for now" / stub / mock.'),
    item('swallowed', 'Empty catch blocks, except: pass, silent Go err returns.'),
    item('placeholder', 'Hardcoded localhost, YOUR_API_KEY, foo/bar names, magic ports.'),
    note('Red dot in the navigator = ≥1 warn. Yellow dot = info-only. Click the dot or top-bar ⚠ N.'),
  ]));

  card.appendChild(section('Confidence colors (Trace edges)', [
    item('green', 'Same-file call — high confidence.'),
    item('purple', 'Resolved via local import — medium confidence.'),
    item('gray-dashed', 'Single-name guess — low confidence.'),
  ]));

  card.appendChild(section('Keyboard', [
    item('1 / 2 / 3 / 4', 'Toggle Walk / Graph / Smells / Lineage overlays (Lineage active when a README "### Branch lineage" section is found).'),
    item('Esc', 'Exit any overlay or close help.'),
    item('h or ?', 'Toggle this help panel.'),
  ]));

  root.appendChild(card);
}

function header(onChange) {
  const head = el('div', { cls: 'help-head' });
  head.appendChild(el('div', { cls: 'help-title', text: 'Help & glossary' }));
  head.appendChild(el('div', { cls: 'help-sub', text: 'Click anywhere outside or press Esc to close.' }));
  head.appendChild(el('button', {
    cls: 'help-close', type: 'button', text: '✕',
    title: 'Close (Esc)',
    on: { click: () => { closeHelp(); onChange(); } },
  }));
  return head;
}

function section(title, items) {
  const s = el('div', { cls: 'help-section' });
  s.appendChild(el('div', { cls: 'help-section-title', text: title }));
  for (const it of items) s.appendChild(it);
  return s;
}

function item(term, def) {
  const row = el('div', { cls: 'help-item' });
  row.appendChild(el('span', { cls: 'help-term', text: term }));
  row.appendChild(el('span', { cls: 'help-def', text: def }));
  return row;
}

function note(text) {
  return el('div', { cls: 'help-note', text });
}
