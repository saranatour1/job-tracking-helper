# Loops

`/loops` lets people set up searches that run each morning. The `Loops` tab lists their loops (up to 3), each with `Run now`, `Pause`/`Resume` and `Remove`, the jobs runs kept under `New jobs` with `Save`, `Applied` and `Dismiss`, and templates filled in from Preferences. Opening a template (`?template=remote-fit`) shows eight yes/no questions, 5/10/20 jobs and a start time; `Start loop` saves it. `Runs` lists every run with what it read, kept and saved, and `Sources` shows Firecrawl and context.dev credits this month.

Tables: `loops`, `loopRuns`, `jobLeads`, `sourceUsage`. Each run is a `@convex-dev/workflow` workflow and logs one evlog JSON event (`work: "loop.run"`) in the Convex logs.

## Checks

- `loops-create` saves a loop from a template and shows its next run.
- `loops-skip` runs a loop with no source key set: the run ends `skipped` with a note naming the env keys.
- `loops-log` the run's evlog event appears in the Convex logs.

## Steps

- **Create.** As a guest with Preferences filled, `navigate` to `/loops?tab=loops&template=remote-fit`, click `Start loop`. The URL becomes `/loops?tab=loops` and `Your loops · 1 of 3` shows `Remote roles that fit` with a `Next run`.
- **Skip.** With no `FIRECRAWL_API_KEY` or `CONTEXT_DEV_API_KEY` in the Convex env, click `Run now`. Within a few seconds `Last run` reads `skipped`, and `/loops?tab=runs` shows the run with `No source is set up yet. Add FIRECRAWL_API_KEY or CONTEXT_DEV_API_KEY to the Convex env.`
- **Log.** Read the deployment's logs (the Convex MCP `logs` tool or the dashboard): a `[WARN]` line holds `"work":"loop.run"` and `"outcome":"skipped"`.
- **Run now limit.** A fourth `Run now` in a day says `You've run loops by hand 3 times today.`

## Gotchas

- `Run now` refuses while the loop's last run is still `queued` or `running`.
- Sources tab badges read `Not set up` until a key is in the Convex env.
- Searching and reading postings needs a real key; with one set, check `Runs` for `done` and `New jobs` for kept postings.
