const cases = [];
export function test(name, fn) { cases.push({ name, fn }); }

export function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
export function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg || `deep mismatch:\n  expected ${b}\n  got      ${a}`);
}
export function assertNull(v, msg)  { if (v !== null) throw new Error(msg || `expected null, got ${JSON.stringify(v)}`); }
export function assertTrue(v, msg)  { if (v !== true) throw new Error(msg || `expected true, got ${JSON.stringify(v)}`); }
export function assertFalse(v, msg) { if (v !== false) throw new Error(msg || `expected false, got ${JSON.stringify(v)}`); }

export async function report(rootId = 'results') {
  const root = document.getElementById(rootId);
  let pass = 0, fail = 0;
  for (const c of cases) {
    const line = document.createElement('div');
    try {
      await c.fn();
      line.textContent = `✓ ${c.name}`;
      line.style.color = '#3fb950';
      pass++;
    } catch (e) {
      line.textContent = `✗ ${c.name} — ${e.message}`;
      line.style.color = '#f85149';
      fail++;
      console.error(c.name, e);
    }
    root.appendChild(line);
  }
  const summary = document.createElement('div');
  summary.style.marginTop = '12px';
  summary.style.fontWeight = 'bold';
  summary.textContent = `${pass}/${cases.length} passed${fail ? ` (${fail} failed)` : ''}`;
  root.appendChild(summary);
  console.log(`${pass}/${cases.length} passed`);
}
