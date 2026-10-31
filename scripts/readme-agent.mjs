import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const START = '<!-- profile-terminal:start -->';
export const END = '<!-- profile-terminal:end -->';
export const PHASES = [
  ['Percolating', 'Idling.'],
  ['Combobulating', 'Thinking.'],
  ['Deslopping', '...'],
  ['Adding slop', '...'],
];

export function replacePanel(readme, panel) {
  if (readme.split(START).length !== 2 || readme.split(END).length !== 2) {
    throw new Error('README must contain exactly one profile-terminal marker pair');
  }
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (end < start) throw new Error('Profile-terminal markers are reversed');
  return readme.slice(0, start + START.length) + '\n' + panel + '\n' + readme.slice(end);
}

export function advance(previous, { now, runId, runUrl }) {
  if (runId && previous?.runId === runId) return previous;
  const tick = previous ? previous.tick + 1 : 0;
  const phase = tick % PHASES.length;
  const [activity, thought] = PHASES[phase];
  return {
    tick, runId, runUrl, updatedAt: now.toISOString(),
    log: [
      { at: now.toISOString(), activity, thought },
      ...(previous?.log ?? []),
    ].slice(0, 6),
  };
}

export function render(state, repository) {
  return `![An animated NPC agent types idle thoughts beside a blinking pixel bird.](https://raw.githubusercontent.com/${repository}/main/agent/terminal.gif?heartbeat=${state.tick})`;
}

export async function main() {
  const repository = process.env.GITHUB_REPOSITORY ?? 'JakeNesler/JakeNesler';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository');
  const runId = process.env.GITHUB_RUN_ID ?? null;
  const readme = await readFile('README.md', 'utf8');
  // Check markers before changing any state.
  replacePanel(readme, '');
  let previous = null;
  try {
    previous = JSON.parse(await readFile('agent/state.json', 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const now = new Date();
  const state = advance(previous, {
    now, runId,
    runUrl: runId ? `https://github.com/${repository}/actions/runs/${runId}` : null,
  });
  const panel = render(state, repository);
  await writeFile('README.md', replacePanel(readme, panel));
  await writeFile('agent/state.json', JSON.stringify(state, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, panel + '\n', { flag: 'a' });
  console.log(`${PHASES[state.tick % PHASES.length][0]}: ${state.log[0].thought}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
