# The NPC in the README

A small NPC idles in an animated terminal labeled `Agent:`. It types short thoughts, backspaces, pauses, and occasionally wanders into nonsense. A pixel bird blinks, bobs, and ducks during backspacing.

Thinking words cycle while the animation plays: Combobulating, Percolating, Cogitating, Discombobulating, Recombobulating, and others. Deslopping and Adding slop have their own moments. There are no greetings, hype, or sign-offs.

Every 30 minutes, GitHub Actions advances the scene seed and regenerates the looping GIF. Each scene uses a deterministic mix of lines; roughly one third include an absurd tangent. Re-running the same successful Actions run preserves its scene. No model, external data feeds, or paid API is involved.

The README contains only the image and hidden update markers. The GIF plays without refreshing; newly generated scenes appear after a page refresh. Each scene changes the image URL query string. Visitors who disable animated images see a static frame and descriptive alt text.

The renderer requires Go 1.27.3 or later. Actions resolves the latest stable Go for tests and rendering. The workflow commits only `README.md`, `agent/state.json`, and `agent/terminal.gif` using the built-in repository token.

Run **Profile terminal → Run workflow** in Actions to refresh it manually. Change the schedule in `.github/workflows/profile-terminal.yml`, or disable that workflow to stop updates. Default-branch rules must allow the generated commits.

Checks:

```sh
node --test scripts/readme-agent.test.mjs
(cd agent/renderer && go test ./... && go vet ./...)
actionlint
```

Generate a scene locally:

```sh
node scripts/readme-agent.mjs
(cd agent/renderer && go run .)
```
