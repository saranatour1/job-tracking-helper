# Loops

`/loops` lets people set up searches that run by themselves each morning (Auto) or when they press `Run now` (Manual). The `Loops` tab lists their loops (up to 3), each with `Run now`, `Turn auto on`/`Turn auto off` and `Remove`, the jobs runs kept under `New jobs` with `Save`, `Applied` and `Dismiss`, and templates filled in from Preferences. Opening a template (`?template=remote-fit`) shows the run as five numbered steps (when it runs, what it searches for, how much it reads, what it leaves out, what you get), each with switches and a `What it does` box that updates with the answers; `Start loop` saves it. `Runs` lists every run with what it read, kept and saved, and `Sources` shows Firecrawl and context.dev credits this month.

Tables: `loops`, `loopRuns`, `jobLeads`, `sourceUsage`. Each run is a `@convex-dev/workflow` workflow and logs one evlog JSON event (`work: "loop.run"`) in the Convex logs.

## Checks

- `loops-create` saves a loop from a template and shows its next run.
- `loops-skip` runs a loop with no source key set: the run ends `skipped` with a note naming the env keys.
- `loops-log` the run's evlog event appears in the Convex logs.

## Steps

- **Create.** As a guest with Preferences filled, `navigate` to `/loops?tab=loops&template=remote-fit`, click `Start loop`. The URL becomes `/loops?tab=loops` and `Your loops · 1 of 3` shows `Remote roles that fit` with a `Next run`.
- **Skip.** With no `FIRECRAWL_API_KEY` or `CONTEXT_DEV_API_KEY` in the Convex env, click `Run now`. Within a few seconds `Last run` reads `skipped`, and `/loops?tab=runs` shows the run with `No source is set up yet. Add FIRECRAWL_API_KEY or CONTEXT_DEV_API_KEY to the Convex env.`
- **Log.** Read the deployment's logs (the Convex MCP `logs` tool or the dashboard): a `[WARN]` line holds `"work":"loop.run"` and `"outcome":"skipped"`.
- **Steps.** On `/loops?tab=loops&template=custom`, click `Remote only`: step 2's search words end in `remote` and step 4 lists `Postings that don't say they're remote`. Turn off the first switch (`Run by itself every morning`): step 1 reads `Only when you press Run now`. `Start loop` adds a loop with a `Manual` badge.
- **Run now limit.** A fourth `Run now` in a day says `You've run loops by hand 3 times today.`

## Gotchas

- `Run now` refuses while the loop's last run is still `queued` or `running`.
- Sources tab badges read `Not set up` until a key is in the Convex env.
- Switches are named through `aria-labelledby`, which `find` doesn't resolve; `find` `"switch"` and pick by order, or read the label text next to it.
- Reads go through the `readPool` workpool; with a key set, the Convex dashboard's readPool component shows them queued and running.
- Searching and reading postings needs a real key; with one set, check `Runs` for `done` and `New jobs` for kept postings.
