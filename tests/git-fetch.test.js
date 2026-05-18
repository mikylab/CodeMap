import { test, assertDeepEqual, assertNull } from './runner.js';
import { parseRepoUrl } from '../src/git-fetch.js';

test('parseRepoUrl: github bare', () => {
  assertDeepEqual(parseRepoUrl('github.com/octocat/hello-world'),
    { host: 'github', owner: 'octocat', repo: 'hello-world', ref: null, subpath: '' });
});

test('parseRepoUrl: github https', () => {
  assertDeepEqual(parseRepoUrl('https://github.com/octocat/hello-world'),
    { host: 'github', owner: 'octocat', repo: 'hello-world', ref: null, subpath: '' });
});

test('parseRepoUrl: github .git suffix stripped', () => {
  assertDeepEqual(parseRepoUrl('https://github.com/octocat/hello-world.git'),
    { host: 'github', owner: 'octocat', repo: 'hello-world', ref: null, subpath: '' });
});

test('parseRepoUrl: github tree branch + subpath', () => {
  assertDeepEqual(parseRepoUrl('github.com/octocat/hello-world/tree/dev/src/lib'),
    { host: 'github', owner: 'octocat', repo: 'hello-world', ref: 'dev', subpath: 'src/lib' });
});

test('parseRepoUrl: github ssh form', () => {
  assertDeepEqual(parseRepoUrl('git@github.com:octocat/hello-world.git'),
    { host: 'github', owner: 'octocat', repo: 'hello-world', ref: null, subpath: '' });
});

test('parseRepoUrl: gitlab nested group', () => {
  assertDeepEqual(parseRepoUrl('https://gitlab.com/foo/bar/repo'),
    { host: 'gitlab', owner: 'foo/bar', repo: 'repo', ref: null, subpath: '' });
});

test('parseRepoUrl: gitlab tree with branch', () => {
  assertDeepEqual(parseRepoUrl('https://gitlab.com/foo/bar/-/tree/main/sub/dir'),
    { host: 'gitlab', owner: 'foo', repo: 'bar', ref: 'main', subpath: 'sub/dir' });
});

test('parseRepoUrl: rejects garbage', () => {
  assertNull(parseRepoUrl(''));
  assertNull(parseRepoUrl('not a url'));
  assertNull(parseRepoUrl('https://example.com/foo/bar'));
  assertNull(parseRepoUrl('github.com/onlyone'));
});
