# The terminal in the README

This is a simulated agent with a real GitHub Actions heartbeat. A Go program renders a looping terminal GIF that types to visitors, blinks, pauses, backspaces a thought, and cycles through its activities. It plays while the profile is open; no model or paid API is involved. The terminal is labeled `Agent:`.

Every 30 minutes, the workflow reads the latest 30 events from the owner's **public** GitHub activity feed, excludes this profile repository, and advances one step:

1. Digging
2. Combobulating
3. Deslopping
4. Adding slop

Each heartbeat chooses a different mix of short, quiet thoughts, without greetings, welcome messages, hype, or sign-offs. Roughly one third include a tangent: generated nonsense, the bird declining to comment, or the terminal velocity of a latent swallow. The selection is deterministic for a heartbeat, so rerunning it does not invent a second conversation.

The thinking status cycles through words such as Combobulating, Percolating, Cogitating, Discombobulating, and Recombobulating while the typing animation runs. Deslopping and Adding slop keep their own status labels.

A small pixel bird in the header blinks, bobs, and ducks down during backspacing. The sprite is drawn directly by the Go renderer with the terminal's existing palette.

The animation includes the latest sampled public repository. It does not detect visitors, answer questions, or describe actual code changes. The public activity snapshot is real, but GitHub's events feed can lag. The README contains only the terminal image and hidden update markers.

Scranton weather comes from [NWS station KAVP](https://api.weather.gov/stations/KAVP/observations/latest), at Wilkes-Barre/Scranton International Airport. Conditions are polled every heartbeat and temperatures use Fahrenheit. Missing temperature values are not treated as zero. Observations over three hours old are rejected; a failed poll retains the previous report with an unavailable label, or says the feed is unavailable if no report exists. Weather failures do not stop the animation.

The local day and part of day use `America/New_York`, including daylight saving transitions: for example, "Saturday evening in Scranton." No minute-by-minute clock is displayed. This is the time of the last snapshot, not a clock connected to the visitor's browser.

The renderer requires Go 1.27.3 or later. The workflow resolves the latest stable Go release for both tests and GIF rendering.

The workflow publishes a run summary and commits only `README.md`, `agent/state.json`, and `agent/terminal.gif` as `github-actions[bot]`. It uses the repository's built-in `GITHUB_TOKEN`; no personal token or AI key is needed. It does not post issue comments.

Run **Profile terminal → Run workflow** in Actions to wake it manually. Scheduled runs use the default branch. A failed poll fails the run and leaves the last committed heartbeat intact. Re-running the same successful run does not advance the lap again.

The GIF animates without a page refresh. New activity context still requires refreshing the page: bursts of API writes cannot push updated README contents into an already-open profile. Each heartbeat changes the image URL's query string so a freshly loaded README requests the new image. Visitors who disable animated images in GitHub's accessibility settings will see a static frame; the image has descriptive alt text.

GitHub schedules can be delayed. Public repository schedules may be disabled after 60 days without repository activity. See [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

To change the cadence, edit `.github/workflows/profile-terminal.yml`. Disable that workflow in Actions to stop it. If repository rules prevent the bot from pushing to the default branch, those rules must allow these generated updates.

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
