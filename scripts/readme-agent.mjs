import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const START = '<!-- resident-agent:start -->';
export const END = '<!-- resident-agent:end -->';
export const PHASES = [
  ['Digging', 'Looking for the problem underneath the other problem.'],
  ['Combobulating', 'The pieces fit. Investigating whether that is suspicious.'],
  ['Deslopping', 'Removed unnecessary abstraction. It had dependents.'],
  ['Adding slop', 'Put a little back. The tests were getting lonely.'],
];

export function replacePanel(readme, panel) {
  if (readme.split(START).length !== 2 || readme.split(END).length !== 2) {
    throw new Error('README must contain exactly one resident-agent marker pair');
  }
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (end < start) throw new Error('Resident-agent markers are reversed');
  return readme.slice(0, start + START.length) + '\n' + panel + '\n' + readme.slice(end);
}

export function summarizeEvents(events, repository) {
  if (!Array.isArray(events)) throw new Error('Expected a public event array');
  return events.filter(event => event.public === true
    && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(event.repo?.name ?? '')
    && event.repo.name.toLowerCase() !== repository.toLowerCase());
}

export function advance(previous, { now, runId, runUrl, events, repository, etag }) {
  if (runId && previous?.runId === runId) return previous;
  const tick = previous ? previous.tick + 1 : 0;
  const phase = tick % PHASES.length;
  const [activity, thought] = PHASES[phase];
  const visible = events === null ? null : summarizeEvents(events, repository);
  const snapshot = visible === null ? previous?.snapshot : {
    sampled: visible.length,
    latestRepo: visible[0]?.repo.name ?? null,
    latestAt: visible[0]?.created_at ?? null,
  };
  if (!snapshot) throw new Error('No public activity snapshot available');
  return {
    tick, runId, runUrl, updatedAt: now.toISOString(),
    etag: etag ?? previous?.etag ?? null,
    snapshot,
    log: [
      { at: now.toISOString(), activity, thought },
      ...(previous?.log ?? []),
    ].slice(0, 6),
  };
}

export function render(state, repository) {
  const phase = state.tick % PHASES.length;
  const progress = (phase + 1) * 25;
  const bar = '#'.repeat((phase + 1) * 4).padEnd(16, '.');
  const time = iso => iso.replace('T', ' ').slice(0, 16) + ' UTC';
  const latest = state.snapshot.latestRepo
    ? `Latest in sample: [${state.snapshot.latestRepo}](https://github.com/${state.snapshot.latestRepo}) · ${time(state.snapshot.latestAt)}.`
    : 'No other public activity in the latest sample. Digging anyway.';
  const logs = state.log.map(entry => `${time(entry.at)}  ${entry.activity}\n  > ${entry.thought}`).join('\n\n');
  return `### There is an agent in my README

[![Resident agent](https://github.com/${repository}/actions/workflows/resident-agent.yml/badge.svg)](https://github.com/${repository}/actions/workflows/resident-agent.yml)

\`\`\`text
resident-agent ~ ${['◐', '◓', '◑', '◒'][phase]}

${PHASES[phase][0]}...
${PHASES[phase][1]}

current lap  [${bar}] ${progress}%
laps survived: ${Math.floor(state.tick / PHASES.length)}
next step: ${PHASES[(phase + 1) % PHASES.length][0]}
last heartbeat: ${time(state.updatedAt)}
\`\`\`

${latest}

<details>
<summary>What has it been doing?</summary>

\`\`\`text
${logs}
\`\`\`

</details>

*Simulated agent, real public activity polling. Wakes about every 30 minutes. Slop levels remain unverified.*

[Watch it work](${state.runUrl ?? `https://github.com/${repository}/actions/workflows/resident-agent.yml`}) · [How it works](agent/README.md)`;
}

export async function main() {
  const repository = process.env.GITHUB_REPOSITORY ?? 'JakeNesler/JakeNesler';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository');
  const runId = process.env.GITHUB_RUN_ID ?? null;
  const readme = await readFile('README.md', 'utf8');
  // Check markers before polling or changing any state.
  replacePanel(readme, '');
  let previous = null;
  try {
    previous = JSON.parse(await readFile('agent/state.json', 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'readme-resident-agent' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  if (previous?.etag) headers['If-None-Match'] = previous.etag;
  const response = await fetch(`https://api.github.com/users/${repository.split('/')[0]}/events/public?per_page=30`, {
    headers, signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok && response.status !== 304) throw new Error(`Public activity poll failed: HTTP ${response.status}`);
  const state = advance(previous, {
    now: new Date(), runId, repository,
    runUrl: runId ? `https://github.com/${repository}/actions/runs/${runId}` : null,
    events: response.status === 304 ? null : await response.json(),
    etag: response.headers.get('etag'),
  });
  const panel = render(state, repository);
  await writeFile('README.md', replacePanel(readme, panel));
  await writeFile('agent/state.json', JSON.stringify(state, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, panel + '\n', { flag: 'a' });
  console.log(`${PHASES[state.tick % PHASES.length][0]}: ${state.log[0].thought}`);
  console.log(`Public activity sample: ${state.snapshot.sampled} events outside this profile repository.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
