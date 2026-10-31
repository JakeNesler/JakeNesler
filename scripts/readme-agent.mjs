import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const START = '<!-- profile-terminal:start -->';
export const END = '<!-- profile-terminal:end -->';
export const PHASES = [
  ['Digging', 'Looking for the problem underneath the other problem.'],
  ['Combobulating', 'The pieces fit. Investigating whether that is suspicious.'],
  ['Deslopping', 'Removed unnecessary abstraction. It had dependents.'],
  ['Adding slop', 'Put a little back. The tests were getting lonely.'],
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

export function summarizeEvents(events, repository) {
  if (!Array.isArray(events)) throw new Error('Expected a public event array');
  return events.filter(event => event.public === true
    && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(event.repo?.name ?? '')
    && event.repo.name.toLowerCase() !== repository.toLowerCase());
}

export function advance(previous, { now, runId, runUrl, events, repository, etag, weather }) {
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
    weather: weather ?? previous?.weather ?? null,
    log: [
      { at: now.toISOString(), activity, thought },
      ...(previous?.log ?? []),
    ].slice(0, 6),
  };
}

export function render(state, repository) {
  return `![A simulated terminal types a greeting, digs through public activity, combobulates, deslops, and adds slop.](https://raw.githubusercontent.com/${repository}/main/agent/terminal.gif?heartbeat=${state.tick})`;
}

export function summarizeWeather(payload, now) {
  const p = payload?.properties;
  const observed = new Date(p?.timestamp);
  const age = now.getTime() - observed.getTime();
  if (!Number.isFinite(age) || age < -600_000 || age > 10_800_000) throw new Error('Weather observation is missing or stale');
  const reading = p?.temperature;
  let temperatureF = null;
  if (typeof reading?.value === 'number' && Number.isFinite(reading.value)) {
    if (reading.unitCode === 'wmoUnit:degC') temperatureF = Math.round(reading.value * 9 / 5 + 32);
    else if (reading.unitCode === 'wmoUnit:degF') temperatureF = Math.round(reading.value);
  }
  const description = String(p?.textDescription ?? '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 60);
  if (temperatureF === null && !description) throw new Error('Weather observation has no conditions');
  return { station: 'KAVP', observedAt: observed.toISOString(), temperatureF, description, stale: false };
}

export async function pollWeather(previous, now, fetcher = fetch) {
  try {
    const response = await fetcher('https://api.weather.gov/stations/KAVP/observations/latest', {
      headers: { Accept: 'application/geo+json', 'User-Agent': 'JakeNesler-profile-terminal (github.com/JakeNesler/JakeNesler)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    return summarizeWeather(await response.json(), now);
  } catch {
    console.warn('Weather poll unavailable; preserving the last report with a stale label.');
    return previous?.observedAt ? { ...previous, stale: true } : { unavailable: true };
  }
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
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'readme-profile-terminal' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  if (previous?.etag) headers['If-None-Match'] = previous.etag;
  const now = new Date();
  const [response, weather] = await Promise.all([
    fetch(`https://api.github.com/users/${repository.split('/')[0]}/events/public?per_page=30`, {
      headers, signal: AbortSignal.timeout(20_000),
    }),
    pollWeather(previous?.weather, now),
  ]);
  if (!response.ok && response.status !== 304) throw new Error(`Public activity poll failed: HTTP ${response.status}`);
  const state = advance(previous, {
    now, runId, repository, weather,
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
