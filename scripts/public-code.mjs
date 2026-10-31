const SOURCES = [
  { repository: 'JakeNesler/OpenProphet', paths: ['services/technical_analysis.go'] },
  { repository: 'Yscale-sh/yscale', paths: ['central/internal/decider/placement.go', 'central/internal/cost/composite_source.go', 'agent/internal/agent/pending_pod_constraints.go'] },
];

export function extractSnippets(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^func (?:\([^)]*\) )?[A-Za-z_]\w*\(/.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && lines[end] !== '}') end++;
    end = Math.min(end + 1, i + 16, lines.length);
    const excerpt = lines.slice(i, end);
    const code = excerpt.join('\n');
    if (excerpt.length < 6 || code.length < 100 || code.length > 850 || /[^\x09\x0A\x20-\x7E]/.test(code)) continue;
    if (excerpt.filter(line => /^\s*\/\//.test(line)).length > excerpt.length / 4) continue;
    if (excerpt.some(line => line.replace(/\t/g, '    ').length > 100)) continue;
    candidates.push({ startLine: i + 1, endLine: end, lines: excerpt });
  }
  return candidates;
}

export async function loadSnippet(tick, fetcher = fetch) {
  const source = SOURCES[tick % SOURCES.length];
  const request = async endpoint => {
    const response = await fetcher(`https://api.github.com/repos/${source.repository}${endpoint}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'JakeNesler-profile-terminal' },
      redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Public source request failed: HTTP ${response.status}`);
    return response.json();
  };
  // Deliberately unauthenticated: private repositories cannot supply excerpts.
  const repo = await request('');
  if (repo.private !== false || repo.visibility !== 'public' || repo.full_name?.toLowerCase() !== source.repository.toLowerCase()) {
    throw new Error('Code source must be the allowlisted public repository');
  }
  const commit = await request(`/commits/${encodeURIComponent(repo.default_branch)}`);
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Invalid public source revision');
  for (let attempt = 0; attempt < source.paths.length; attempt++) {
    const path = source.paths[(Math.floor(tick / SOURCES.length) + attempt) % source.paths.length];
    const file = await request(`/contents/${path}?ref=${commit.sha}`);
    if (file.type !== 'file' || file.path !== path || file.encoding !== 'base64' || file.size > 262_144) {
      throw new Error('Invalid public source file');
    }
    const candidates = extractSnippets(Buffer.from(file.content, 'base64').toString('utf8'));
    if (candidates.length === 0) continue;
    const excerpt = candidates[Math.floor(tick / (SOURCES.length * source.paths.length)) % candidates.length];
    return {
      repository: source.repository, path, commit: commit.sha, ...excerpt,
      url: `https://github.com/${source.repository}/blob/${commit.sha}/${path}#L${excerpt.startLine}-L${excerpt.endLine}`,
    };
  }
  throw new Error('No suitable public code excerpt found');
}
