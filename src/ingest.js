import { shouldSkipPath, parseFile } from './parser.js';
import { parseGitLog, looksLikeGitLog } from './git-log.js';
import { mark, measure } from './perf.js';

export const MAX_BYTES = 2_000_000;
const MAX_SKIPPED_SAMPLES = 50;

export function newSkipped() { return { tooLarge: [], tooLargeCount: 0, unsupported: 0 }; }

export function noteTooLarge(skipped, path, bytes) {
  skipped.tooLargeCount++;
  if (skipped.tooLarge.length < MAX_SKIPPED_SAMPLES) skipped.tooLarge.push({ path, bytes });
}

export async function ingestFromDrop(dataTransfer) {
  const t0 = mark();
  const items = [...dataTransfer.items];
  const out = [];
  const skipped = newSkipped();
  const ctx = { gitLog: null };
  await Promise.all(items.map(it => {
    const entry = it.webkitGetAsEntry?.();
    if (entry) return walkEntry(entry, '', out, skipped, ctx);
    if (it.kind === 'file') return readFileItem(it.getAsFile(), '', out, skipped, ctx);
    return null;
  }));
  measure('ingest', t0, `parsed=${out.length} tooLarge=${skipped.tooLargeCount} unsupported=${skipped.unsupported}`);
  return { files: out, skipped, gitLog: ctx.gitLog };
}

async function walkEntry(entry, prefix, out, skipped, ctx) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    await readFileItem(file, prefix, out, skipped, ctx);
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
  await Promise.all(all.map(e => walkEntry(e, prefix + entry.name + '/', out, skipped, ctx)));
}

async function readFileItem(file, prefix, out, skipped, ctx) {
  const path = prefix + file.name;
  const namedLog = file.name === 'codemap-history.txt' || /\.git-log$/.test(file.name);
  if (!namedLog && shouldSkipPath(path)) return;
  if (file.size > MAX_BYTES) { noteTooLarge(skipped, path, file.size); return; }
  const src = await file.text();
  if (looksLikeGitLog(src)) { ctx.gitLog = parseGitLog(src); return; }
  // Named like a git-log but content didn't match — don't try to parse as source.
  if (namedLog) return;
  const parsed = parseFile(file.name, src, path);
  if (parsed) out.push(parsed);
  else skipped.unsupported++;
}
