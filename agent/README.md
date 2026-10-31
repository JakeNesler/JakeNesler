# The agent in the README

This is a simulated agent with a real GitHub Actions heartbeat. A Go program renders a looping terminal GIF that types to visitors, blinks, pauses, backspaces a thought, and cycles through its activities. It plays while the profile is open; no model or paid API is involved.

Every 30 minutes, the workflow reads the latest 30 events from the owner's **public** GitHub activity feed, excludes this profile repository, and advances one step:

1. Digging
2. Combobulating
3. Deslopping
4. Adding slop

The animation's dialogue is scripted and includes the latest sampled public repository. It does not detect visitors, answer questions, or describe actual code changes. The public activity snapshot is real, but GitHub's events feed can lag. Each tick refreshes the GIF, timestamp, and six recent thoughts. Everything outside the marked README section is preserved. The static progress bar in the expandable notes tracks the workflow's four-step lap.

The workflow publishes a run summary and commits only `README.md`, `agent/state.json`, and `agent/terminal.gif` as `github-actions[bot]`. It uses the repository's built-in `GITHUB_TOKEN`; no personal token or AI key is needed. It does not post issue comments.

Run **Resident agent → Run workflow** in Actions to wake it manually. Scheduled runs use the default branch. A failed poll fails the run and leaves the last committed heartbeat intact. Re-running the same successful run does not advance the lap again.

The GIF animates without a page refresh. New activity context still requires refreshing the page: bursts of API writes cannot push updated README contents into an already-open profile. Each heartbeat changes the image URL's query string so a freshly loaded README requests the new image. Visitors who disable animated images in GitHub's accessibility settings will see a static frame; the expandable notes provide a text equivalent.

GitHub schedules can be delayed. Public repository schedules may be disabled after 60 days without repository activity. See [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

To change the cadence, edit `.github/workflows/resident-agent.yml`. Disable that workflow in Actions to stop it. If repository rules prevent the bot from pushing to the default branch, those rules must allow these generated updates.

Local checks:

```sh
node --test scripts/readme-agent.test.mjs
(cd agent/renderer && go test ./... && go vet ./...)
actionlint
```

To preview a real public poll locally (this updates the README and state):

```sh
node scripts/readme-agent.mjs
(cd agent/renderer && go run .)
```
