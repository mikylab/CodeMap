// Usage: node tests/node-run.mjs <suite>   (suite = filename without .test.js)
// Note: browser-only suites (e.g. `triage`, which uses localStorage) are not
// headless-safe and are expected to fail under Node — run those in tests.html.
import { runConsole } from './runner.js';

const suite = process.argv[2];
if (!suite) {
  console.error('usage: node tests/node-run.mjs <suite>');
  process.exit(2);
}
await import(`./${suite}.test.js`);          // registers cases into runner
const failures = await runConsole();
process.exit(failures ? 1 : 0);
