import assert from 'node:assert/strict';
import test from 'node:test';
import { advance, END, PHASES, render, replacePanel, START, summarizeEvents } from './readme-agent.mjs';

const repository = 'JakeNesler/JakeNesler';
const event = { public: true, repo: { name: 'JakeNesler/example' }, created_at: '2026-10-31T10:00:00Z' };
const options = (id = '1') => ({ now: new Date('2026-10-31T12:00:00Z'), runId: id, runUrl: `https://github.com/${repository}/actions/runs/${id}`, repository, events: [event], etag: 'sample' });

test('only the marked block changes; invalid markers fail closed', () => {
  const before = `intro\n${START}\nold\n${END}\nfooter\n`;
  assert.equal(replacePanel(before, 'new'), `intro\n${START}\nnew\n${END}\nfooter\n`);
  for (const invalid of ['none', `${START}${START}${END}`, `${END}${START}`, START]) {
    assert.throws(() => replacePanel(invalid, 'new'));
  }
});

test('cycles through all phases and bounds the journal over repeated polls', () => {
  let state = null;
  for (let i = 0; i < 20; i++) {
    state = advance(state, options(String(i)));
    assert.equal(state.log[0].activity, PHASES[i % 4][0]);
    assert.equal(state.log.length, Math.min(i + 1, 6));
  }
  assert.equal(state.tick, 19);
  assert.match(render(state, repository), /laps survived: 4/);
  assert.match(render(state, repository), /\[################\] 100%/);
  assert.match(render(state, repository), /actions\/runs\/19/);
});

test('rerunning the same Actions run is idempotent', () => {
  const state = advance(null, options());
  assert.strictEqual(advance(state, options()), state);
});

test('304 keeps the last public snapshot while advancing the simulation', () => {
  const state = advance(null, options());
  const next = advance(state, { ...options('2'), events: null, etag: null });
  assert.deepEqual(next.snapshot, state.snapshot);
  assert.equal(next.etag, 'sample');
  assert.equal(next.tick, 1);
  assert.throws(() => advance(null, { ...options(), events: null }));
});

test('filters private events, self-generated activity, and unsafe repository names', () => {
  const events = [event, { ...event, public: false }, { ...event, repo: { name: 'jakenesler/jakenesler' } },
    { ...event, repo: { name: 'bad/name\n```' } }];
  assert.deepEqual(summarizeEvents(events, repository), [event]);
  assert.throws(() => summarizeEvents({}, repository));
  const state = advance(null, { ...options(), events: [] });
  assert.match(render(state, repository), /No other public activity/);
});
