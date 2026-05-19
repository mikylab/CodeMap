// Flow tab — the I/O ledger for one function. Two-column layout: declared
// params + read effects + caller arg expressions on the left; return
// expressions + write effects + caller bindings on the right.

import { STATE, selectFn, pushHistory, captureSnapshot, getFlow } from '../state.js';
import { fnKey } from '../trace-graph.js';
import { el, basename } from '../dom.js';
import { effectStrip } from '../effect-badges.js';

export function renderFlow(fn, onChange) {
  const wrap = el('div', { cls: 'ws-pad' });
  const flow = getFlow(fnKey(fn));
  if (!flow) {
    wrap.appendChild(el('div', { cls: 'sb-empty', text: 'No flow data.' }));
    return wrap;
  }
  if (flow.doc) wrap.appendChild(docQuote(flow.doc));
  wrap.appendChild(grid(flow, onChange));
  return wrap;
}

function docQuote(text) {
  const w = el('div', { cls: 'flow-doc' });
  const body = el('div', { cls: 'flow-doc-body' });
  body.textContent = text;
  w.appendChild(body);
  return w;
}

function grid(flow, onChange) {
  const g = el('div', { cls: 'flow-grid' });
  g.appendChild(inputsCol(flow, onChange));
  g.appendChild(outputsCol(flow, onChange));
  return g;
}

function inputsCol(flow, onChange) {
  const col = el('div', { cls: 'flow-col' });
  col.appendChild(el('div', { cls: 'flow-col-head', text: 'INPUTS' }));

  col.appendChild(section('params', flow.params.length
    ? paramList(flow.params)
    : emptyNote('no parameters')));

  if (flow.reads && (flow.reads.direct.size || flow.reads.inherited.size)) {
    col.appendChild(section('reads', effectStrip(flow.reads)));
  }

  if (flow.callerArgs.length) {
    col.appendChild(section('callers pass', callerArgsList(flow.callerArgs, onChange)));
  } else {
    col.appendChild(section('callers pass', emptyNote('No in-codebase callers — entry point or unused.')));
  }
  return col;
}

function outputsCol(flow, onChange) {
  const col = el('div', { cls: 'flow-col' });
  col.appendChild(el('div', { cls: 'flow-col-head', text: 'OUTPUTS' }));

  if (flow.returns.length) {
    col.appendChild(section('returns', returnList(flow.returns)));
  } else {
    col.appendChild(section('returns', emptyNote('no return statements')));
  }

  if (flow.writes && (flow.writes.direct.size || flow.writes.inherited.size)) {
    col.appendChild(section('writes', effectStrip(flow.writes)));
  }

  if (flow.callerBindings.length) {
    col.appendChild(section('callers bind to', callerBindingsList(flow.callerBindings, onChange)));
  }
  return col;
}

function section(label, body) {
  const s = el('div', { cls: 'flow-sec' });
  s.appendChild(el('div', { cls: 'ws-section-label', text: label }));
  s.appendChild(body);
  return s;
}

function paramList(params) {
  const list = el('div', { cls: 'flow-list' });
  for (const p of params) {
    const row = el('div', { cls: 'flow-row mono' });
    row.appendChild(el('span', { cls: 'flow-param-name', text: p.name }));
    if (p.default) {
      row.appendChild(el('span', { cls: 'flow-param-default', text: ' = ' + p.default }));
    }
    list.appendChild(row);
  }
  return list;
}

function returnList(returns) {
  const list = el('div', { cls: 'flow-list' });
  for (const r of returns) {
    const row = el('div', { cls: 'flow-row mono' });
    row.appendChild(el('span', { cls: 'flow-line', text: 'L' + r.line }));
    row.appendChild(el('span', { cls: 'flow-expr', text: 'return ' + r.expr }));
    list.appendChild(row);
  }
  return list;
}

function callerArgsList(callerArgs, onChange) {
  const list = el('div', { cls: 'flow-list' });
  for (const c of callerArgs) {
    list.appendChild(callerHeader(c, onChange, '←'));
    const args = el('div', { cls: 'flow-row mono indented' });
    args.textContent = c.args.length ? `(${c.args.join(', ')})` : '()';
    list.appendChild(args);
  }
  return list;
}

function callerBindingsList(bindings, onChange) {
  const list = el('div', { cls: 'flow-list' });
  for (const c of bindings) {
    const row = el('div', { cls: 'flow-row' });
    row.appendChild(el('button', {
      cls: 'flow-caller-loc', type: 'button',
      text: `${basename(c.fromFile)}:${c.fromLine}`,
      title: c.fromFile,
      on: { click: () => {
        const callerFn = STATE.fnByKey.get(c.fromKey);
        if (!callerFn) return;
        pushHistory(captureSnapshot());
        selectFn(callerFn);
        onChange();
      } },
    }));
    row.appendChild(el('span', { cls: 'flow-binding', text: bindingLabel(c) }));
    list.appendChild(row);
  }
  return list;
}

function callerHeader(c, onChange, glyph) {
  const wrap = el('div', { cls: 'flow-row' });
  wrap.appendChild(el('button', {
    cls: 'flow-caller-loc', type: 'button',
    text: `${glyph} ${basename(c.fromFile)}:${c.fromLine}`,
    title: c.fromFile,
    on: { click: () => {
      const callerFn = STATE.fnByKey.get(c.fromKey);
      if (!callerFn) return;
      pushHistory(captureSnapshot());
      selectFn(callerFn);
      onChange();
    } },
  }));
  return wrap;
}

function bindingLabel(c) {
  if (c.binding === 'lhs') return `${c.text} = ...`;
  if (c.binding === 'return') return 'return ...';
  if (c.binding === 'arg') return '(passed as arg)';
  return '(discarded)';
}

function emptyNote(text) {
  return el('div', { cls: 'sb-empty small', text });
}
