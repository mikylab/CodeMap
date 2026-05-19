// Tiny shared parser primitives used by both parser.js (param extraction at
// parse time) and flow.js (caller-arg extraction at Flow render time).

export function splitArgs(raw) {
  if (!raw || !raw.trim()) return [];
  const out = [];
  let depth = 0, buf = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out;
}
