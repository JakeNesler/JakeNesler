import assert from 'node:assert/strict';
import test from 'node:test';
import { advance, END, PHASES, render, replacePanel, START } from './readme-agent.mjs';

const repository = 'JakeNesler/JakeNesler';
const options = (id = '1') => ({ now: new Date('2026-10-31T12:00:00Z'), runId: id, runUrl: `https://github.com/${repository}/actions/runs/${id}` });

test('only the marked block changes; invalid markers fail closed', () => {
  const before = `intro\n${START}\nold\n${END}\nfooter\n`;
  assert.equal(replacePanel(before, 'new'), `intro\n${START}\nnew\n${END}\nfooter\n`);
  for (const invalid of ['none', `${START}${START}${END}`, `${END}${START}`, START]) {
    assert.throws(() => replacePanel(invalid, 'new'));
  }
});

test('cycles through all phases and bounds the journal over repeated updates', () => {
  let state = null;
  for (let i = 0; i < 20; i++) {
    state = advance(state, options(String(i)));
    assert.equal(state.log[0].activity, PHASES[i % 4][0]);
    assert.equal(state.log.length, Math.min(i + 1, 6));
  }
  assert.equal(state.tick, 19);
  assert.match(render(state, repository), /agent\/terminal-19\.gif/);
  assert.match(render(state, repository), /^!\[[^\n]*\]\(https:\/\/[^\n]*\)$/);
});

test('rerunning the same Actions run is idempotent', () => {
  const state = advance(null, options());
  assert.strictEqual(advance(state, options()), state);
});

test('updates drop the retired reporting data', () => {
  const state = advance(null, options());
  const previous = { ...state, weather: { station: 'KAVP' }, snapshot: { latestRepo: 'example/repo' }, etag: 'old' };
  const next = advance(previous, options('2'));
  assert.equal(next.tick, 1);
  for (const retired of ['weather', 'snapshot', 'etag']) assert.equal(Object.hasOwn(next, retired), false);
});
