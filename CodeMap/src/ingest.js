import { shouldSkipPath, parseFile } from './parser.js';
import { mark, measure } from './perf.js';
import { parseGitLog, looksLikeGitLog } from './git-log.js';

export const MAX_BYTES = 2_000_000;
const GIT_LOG_MAX_BYTES = 8_000_000;
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
  const ctx = { out, skipped, gitLog: null };
  await Promise.all(items.map(it => {
    const entry = it.webkitGetAsEntry?.();
    if (entry) return walkEntry(entry, '', ctx);
    if (it.kind === 'file') return readFileItem(it.getAsFile(), '', ctx);
    return null;
  }));
  measure('ingest', t0, `parsed=${out.length} tooLarge=${skipped.tooLargeCount} unsupported=${skipped.unsupported}`);
  return { files: out, skipped, gitLog: ctx.gitLog };
}

export function ingestGitLogText(text) {
  return parseGitLog(text);
}

async function walkEntry(entry, prefix, ctx) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    await readFileItem(file, prefix, ctx);
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
  await Promise.all(all.map(e => walkEntry(e, prefix + entry.name + '/', ctx)));
}

async function readFileItem(file, prefix, ctx) {
  const path = prefix + file.name;
  const { out, skipped } = ctx;
  if (isGitLogName(file.name) && file.size <= GIT_LOG_MAX_BYTES) {
    const text = await file.text();
    if (looksLikeGitLog(text)) { ctx.gitLog = parseGitLog(text); return; }
  }
  if (shouldSkipPath(path)) return;
  if (file.size > MAX_BYTES) { noteTooLarge(skipped, path, file.size); return; }
  const src = await file.text();
  if (looksLikeGitLog(src)) { ctx.gitLog = parseGitLog(src); return; }
  const parsed = parseFile(file.name, src, path);
  if (parsed) out.push(parsed);
  else skipped.unsupported++;
}

function isGitLogName(name) {
  return name === 'codemap-history.txt' || /\.git-log$/.test(name);
}
