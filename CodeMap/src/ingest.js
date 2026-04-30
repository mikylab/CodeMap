import { shouldSkipPath, parseFile } from './parser.js';

const MAX_BYTES = 2_000_000;

export async function ingestFromDrop(dataTransfer) {
  const items = [...dataTransfer.items];
  const out = [];
  await Promise.all(items.map(it => {
    const entry = it.webkitGetAsEntry?.();
    if (entry) return walkEntry(entry, '', out);
    if (it.kind === 'file') return readFileItem(it.getAsFile(), '', out);
    return null;
  }));
  return out;
}

async function walkEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    await readFileItem(file, prefix, out);
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
  await Promise.all(all.map(e => walkEntry(e, prefix + entry.name + '/', out)));
}

async function readFileItem(file, prefix, out) {
  const path = prefix + file.name;
  if (shouldSkipPath(path)) return;
  if (file.size > MAX_BYTES) return;
  const src = await file.text();
  const parsed = parseFile(file.name, src, path);
  if (parsed) out.push(parsed);
}
