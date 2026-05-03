import { shouldSkipPath, parseFile } from './parser.js';
import { mark, measure } from './perf.js';

const MAX_BYTES = 2_000_000;

export function newSkipped() { return { tooLarge: [], unsupported: 0 }; }

export async function ingestFromDrop(dataTransfer) {
  const t0 = mark();
  const items = [...dataTransfer.items];
  const out = [];
  const skipped = newSkipped();
  await Promise.all(items.map(it => {
    const entry = it.webkitGetAsEntry?.();
    if (entry) return walkEntry(entry, '', out, skipped);
    if (it.kind === 'file') return readFileItem(it.getAsFile(), '', out, skipped);
    return null;
  }));
  measure('ingest', t0, `parsed=${out.length} tooLarge=${skipped.tooLarge.length} unsupported=${skipped.unsupported}`);
  return { files: out, skipped };
}

async function walkEntry(entry, prefix, out, skipped) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    await readFileItem(file, prefix, out, skipped);
    return;
  }
  if (!entry.isDirectory) return;
  const reader = entry.createReader();
  const all = [];
  // readEntries returns at most ~100 entries per call; loop until empty.
  for (;;) {
    const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (batch.length === 0) break;
    all.push(...batch);
  }
  await Promise.all(all.map(e => walkEntry(e, prefix + entry.name + '/', out, skipped)));
}

async function readFileItem(file, prefix, out, skipped) {
  const path = prefix + file.name;
  if (shouldSkipPath(path)) return;
  if (file.size > MAX_BYTES) { skipped.tooLarge.push({ path, bytes: file.size }); return; }
  const src = await file.text();
  const parsed = parseFile(file.name, src, path);
  if (parsed) out.push(parsed);
  else skipped.unsupported++;
}
