import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSnippets, loadSnippet } from './public-code.mjs';

const code = ['package demo', '', 'func Sum(values []int) int {', '\ttotal := 0', '\tfor _, value := range values {', '\t\ttotal += value', '\t}', '\treturn total', '}', ''].join('\n');
const sha = 'a'.repeat(40);

test('excerpts retain exact public source lines and their line numbers', () => {
  const [snippet] = extractSnippets(code);
  assert.equal(snippet.startLine, 3);
  assert.equal(snippet.endLine, 9);
  assert.deepEqual(snippet.lines, code.split('\n').slice(2, 9));
  assert.deepEqual(extractSnippets('func One() int { return 1 }'), []);
  assert.deepEqual(extractSnippets('func Explanation() {\n// A comment explaining the implementation in some detail.\n// Another explanatory comment.\n// More explanation rather than actual code.\n\nreturn\n}'), []);
});

test('rejects private or unexpected repositories before requesting source code', async () => {
  for (const repo of [
    { private: true, visibility: 'private', full_name: 'JakeNesler/OpenProphet' },
    { private: false, visibility: 'public', full_name: 'someone/else' },
  ]) {
    let calls = 0;
    await assert.rejects(loadSnippet(0, async () => { calls++; return { ok: true, json: async () => repo }; }), /allowlisted public repository/);
    assert.equal(calls, 1);
  }
});

test('pins the contents request and clickable attribution to the verified commit', async () => {
  const urls = [];
  const fetcher = async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Authorization, undefined);
    let body;
    if (urls.length === 1) body = { private: false, visibility: 'public', full_name: 'JakeNesler/OpenProphet', default_branch: 'main' };
    else if (urls.length === 2) body = { sha };
    else body = { type: 'file', path: 'services/technical_analysis.go', encoding: 'base64', size: code.length, content: Buffer.from(code).toString('base64') };
    return { ok: true, json: async () => body };
  };
  const snippet = await loadSnippet(0, fetcher);
  assert.equal(urls[2], `https://api.github.com/repos/JakeNesler/OpenProphet/contents/services/technical_analysis.go?ref=${sha}`);
  assert.equal(snippet.url, `https://github.com/JakeNesler/OpenProphet/blob/${sha}/services/technical_analysis.go#L3-L9`);
  assert.equal(snippet.commit, sha);
});

test('a failed public request fails rather than inventing code', async () => {
  await assert.rejects(loadSnippet(0, async () => ({ ok: false, status: 503 })), /HTTP 503/);
});
