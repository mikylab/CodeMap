import { test, assertEqual, assertTrue } from './runner.js';
import { computeRisk, topHotspots, riskBucket } from '../src/risk.js';

const NOW = Date.parse('2026-05-01T00:00:00Z');
const day = 86_400_000;

test('risk: zero commits → 0', () => {
  assertEqual(computeRisk({ cx: 9 }, { commits: 0, lastTouched: NOW / 1000 }, NOW), 0);
});

test('risk: high cx, low churn, old → moderate', () => {
  const stats = { commits: 2, lastTouched: (NOW - 200 * day) / 1000 };
  const r = computeRisk({ cx: 12 }, stats, NOW);
  assertTrue(r > 0 && r < 4, `expected moderate, got ${r}`);
});

test('risk: extreme cx, extreme churn, recent → clamped to 10', () => {
  const stats = { commits: 10_000, lastTouched: NOW / 1000 };
  const r = computeRisk({ cx: 30 }, stats, NOW);
  assertEqual(r, 10);
});

test('risk: recency boost decays past 90 days', () => {
  const recent = computeRisk({ cx: 5 }, { commits: 10, lastTouched: NOW / 1000 }, NOW);
  const old = computeRisk({ cx: 5 }, { commits: 10, lastTouched: (NOW - 365 * day) / 1000 }, NOW);
  assertTrue(recent > old, `recent=${recent} old=${old}`);
});

test('topHotspots: ranks by risk and respects cap', () => {
  const state = {
    files: [
      { path: 'a.js', cx: 12 },
      { path: 'b.js', cx: 3 },
      { path: 'c.js', cx: 8 },
    ],
    gitStatsByPath: {
      'a.js': { commits: 50, lastTouched: NOW / 1000 },
      'b.js': { commits: 1,  lastTouched: NOW / 1000 },
      'c.js': { commits: 20, lastTouched: NOW / 1000 },
    },
  };
  const top = topHotspots(state, 2, NOW);
  assertEqual(top.length, 2);
  assertEqual(top[0].file.path, 'a.js');
  assertEqual(top[1].file.path, 'c.js');
});

test('topHotspots: skips files with no git stats', () => {
  const state = {
    files: [{ path: 'a.js', cx: 5 }, { path: 'b.js', cx: 5 }],
    gitStatsByPath: { 'a.js': { commits: 5, lastTouched: NOW / 1000 } },
  };
  const top = topHotspots(state, 10, NOW);
  assertEqual(top.length, 1);
  assertEqual(top[0].file.path, 'a.js');
});

test('riskBucket thresholds', () => {
  assertEqual(riskBucket(0), 'low');
  assertEqual(riskBucket(3), 'mid');
  assertEqual(riskBucket(6), 'high');
  assertEqual(riskBucket(9.9), 'high');
});
