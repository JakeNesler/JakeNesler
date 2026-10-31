# The agent in the README

This is a simulated agent with a real GitHub Actions heartbeat. No model or paid API is involved.

Every 30 minutes, the workflow reads the latest 30 events from the owner's **public** GitHub activity feed, excludes this profile repository, and advances one step:

1. Digging
2. Combobulating
3. Deslopping
4. Adding slop

The progress bar is the current four-step lap. The commentary is scripted; it does not describe actual code changes. The public activity snapshot is real, but GitHub's events feed can lag. Each tick writes a timestamp, the latest sampled repository, and six recent thoughts into the marked README section. Everything outside the markers is preserved.

The workflow publishes a run summary and commits only `README.md` and `agent/state.json` as `github-actions[bot]`. It uses the repository's built-in `GITHUB_TOKEN`; no personal token or AI key is needed. It does not post issue comments.

Run **Resident agent → Run workflow** in Actions to wake it manually. Scheduled runs use the default branch. A failed poll fails the run and leaves the last committed heartbeat intact. Re-running the same successful run does not advance the lap again.

GitHub schedules can be delayed and the README updates when the page is refreshed. Public repository schedules may be disabled after 60 days without repository activity. See [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

To change the cadence, edit `.github/workflows/resident-agent.yml`. Disable that workflow in Actions to stop it. If repository rules prevent the bot from pushing to the default branch, those rules must allow these generated updates.

Local checks:

```sh
node --test scripts/readme-agent.test.mjs
actionlint
```

To preview a real public poll locally (this updates the README and state):

```sh
node scripts/readme-agent.mjs
```
