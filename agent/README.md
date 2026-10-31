# The code terminal

The terminal labeled `Agent:` types real Go code excerpts from the public `JakeNesler/OpenProphet` and `Yscale-sh/yscale` repositories. It keeps the pixel bird, blinking cursor, and rotating thinking words. It does not generate or execute code.

Every 30 minutes, the workflow alternates repositories, selects an excerpt from a curated source-file allowlist, and generates a new GIF. Each excerpt preserves the source lines and records the repository, file, full commit SHA, and line range in `agent/state.json`. Click the terminal to open those exact lines on GitHub.

Source requests are unauthenticated. Repository metadata must confirm that the exact allowlisted repository is public before code is fetched. A failed request fails the update and leaves the published scene intact. Re-running a successful run preserves its selected code.

The README also links three compiler changes confirmed merged into `golang/go`. Those links sit outside the terminal's update markers and survive scene updates.

The GIF plays without refreshing; newly generated scenes appear after a page refresh. Each scene has a versioned image filename to avoid stale GitHub image caches. The previous generated image is removed on the next update. Visitors who disable animated images see a static frame and descriptive alt text.

The renderer requires Go 1.27.3 or later. Actions resolves the latest stable Go for tests and rendering. The workflow commits only `README.md`, `agent/state.json`, and the generated `agent/terminal-<tick>.gif` using the built-in repository token. No model or paid API is involved.

Run **Profile terminal → Run workflow** in Actions to refresh it manually. Change the schedule in `.github/workflows/profile-terminal.yml`, or disable that workflow to stop updates. Default-branch rules must allow the generated commits.

Checks:

```sh
node --test scripts/*.test.mjs
(cd agent/renderer && go test ./... && go vet ./...)
actionlint
```

Generate a scene locally:

```sh
node scripts/readme-agent.mjs
(cd agent/renderer && go run .)
```
