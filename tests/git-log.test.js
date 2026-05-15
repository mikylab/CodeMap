import { test, assertEqual, assertDeepEqual, assertTrue } from './runner.js';
import { parseGitLog, looksLikeGitLog, summarizeGitLog } from '../src/git-log.js';

const FIX = [
  '__commit__',
  'aaa111',
  '2026-04-01T10:00:00Z',
  'alice@example.com',
  'first commit',
  '10\t0\tsrc/a.js',
  '5\t2\tsrc/b.js',
  '__commit__',
  'bbb222',
  '2026-04-15T12:00:00Z',
  'bob@example.com',
  'rename and edit',
  '3\t1\tsrc/{a.js => c.js}',
  '__commit__',
  'ccc333',
  '2026-05-01T08:00:00Z',
  'alice@example.com',
  'binary asset',
  '-\t-\tassets/logo.png',
  '20\t4\tsrc/b.js',
].join('\n');

test('git-log: looksLikeGitLog detects magic prefix', () => {
  assertTrue(looksLikeGitLog('__commit__\nhash\n...'));
  assertEqual(looksLikeGitLog('hello'), false);
});

test('git-log: parses three commits', () => {
  const { commits } = parseGitLog(FIX);
  assertEqual(commits.length, 3);
  assertEqual(commits[0].hash, 'aaa111');
  assertEqual(commits[1].subject, 'rename and edit');
});

test('git-log: aggregates byPath with rename to new path', () => {
  const { byPath } = parseGitLog(FIX);
  assertEqual(byPath['src/c.js'].commits, 1);
  assertEqual(byPath['src/c.js'].linesAdded, 3);
  assertEqual(byPath['src/a.js'].commits, 1);
  assertDeepEqual(byPath['src/a.js'].authors, ['alice@example.com']);
});

test('git-log: binary numstat counted as commit but 0 lines', () => {
  const { byPath } = parseGitLog(FIX);
  assertEqual(byPath['assets/logo.png'].commits, 1);
  assertEqual(byPath['assets/logo.png'].linesAdded, 0);
  assertEqual(byPath['assets/logo.png'].linesRemoved, 0);
});

test('git-log: deduped sorted authors', () => {
  const { byPath } = parseGitLog(FIX);
  assertDeepEqual(byPath['src/b.js'].authors, ['alice@example.com']);
});

test('git-log: lastTouched is max commit ts', () => {
  const { byPath } = parseGitLog(FIX);
  const expected = Math.floor(Date.parse('2026-05-01T08:00:00Z') / 1000);
  assertEqual(byPath['src/b.js'].lastTouched, expected);
});

test('git-log: empty input → empty result', () => {
  const { commits, byPath } = parseGitLog('');
  assertEqual(commits.length, 0);
  assertDeepEqual(Object.keys(byPath), []);
});

test('git-log: summarize totals, top author, monthly buckets', () => {
  const { commits } = parseGitLog(FIX);
  const s = summarizeGitLog(commits);
  assertEqual(s.totals.commits, 3);
  assertEqual(s.totals.authors, 2);
  assertEqual(s.totals.files, 4);
  assertEqual(s.byAuthor[0].author, 'alice@example.com');
  assertEqual(s.byAuthor[0].commits, 2);
  assertDeepEqual(s.byMonth.map(m => m.month), ['2026-04', '2026-05']);
  assertEqual(s.recent[0].hash, 'ccc333');
  assertEqual(s.topPaths[0].path, 'src/b.js');
});

test('git-log: summarize empty input', () => {
  const s = summarizeGitLog([]);
  assertEqual(s.totals.commits, 0);
  assertDeepEqual(s.byAuthor, []);
  assertDeepEqual(s.byMonth, []);
});
