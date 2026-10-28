# Loops

`/loops` lets people set up searches that run by themselves each morning (Auto) or when they press `Run now` (Manual). The `Loops` tab lists their loops (up to 3), each with icon buttons for `Run now`, `Stop this run`, `Pause daily runs`/`Resume daily runs` and `Remove loop`, `Jobs for you` with a link box (`A job's link`, `Check it`) and `Your shortlist` (`For you` and `Saved`), each row with icon buttons `Save for later`, `Favorite: more like this`, `Dismiss: nothing like this` and `Add to tracker`, and templates filled in from Preferences. Clicking a row opens the job sheet (`?job=`): the verdict, the breakdown under `Fits what you asked for`, `Could fit: the posting doesn't say` and `Doesn't fit`, the posting, and the same four decisions. Opening a template (`?template=remote-fit`) shows the run as six numbered steps (when it runs, the job you want in your words, what it searches for, how many it checks and how many you see, what it leaves out, what you get), each with a `What it does` box that updates with the answers; `Start loop` saves it. `Runs` lists every run with what Jev judged, what fit and what was saved, and `Sources` shows Firecrawl and context.dev credits this month.

`/jobs` lists every role in the shared catalog, newest first, with a search box, `Remote only` and `Compact` switches, and `More like this` on each role. Roles a loop judged show `Fits you · N%` or `Not a fit`.

Tables: `loops`, `loopRuns`, `jobLeads`, `sourceUsage`, `jobs`, `jobBoards`. Each run is a `@convex-dev/workflow` workflow and logs one evlog JSON event (`work: "loop.run"`) in the Convex logs; each board fetch logs `work: "jobs.fetchBoard"`.

## Checks

- `loops-create` saves a loop from a template, with a prompt, and shows its next run.
- `loops-run` runs a loop: it ends `done`, `Runs` shows roles judged and fits, and `New jobs` lists the fits with reasons.
- `jobs-search` searches the catalog, filters to remote roles, switches to compact and follows `More like this`.
- `loops-link` checks a pasted job link and acts on it from the sheet.
- `loops-log` the run's evlog event appears in the Convex logs.

## Steps

- **Create.** As a guest with Preferences filled, `navigate` to `/loops?tab=loops&template=remote-fit`, type a sentence into `The job you want`, click `Start loop`. The URL becomes `/loops?tab=loops` and the new loop shows a `Wants` row with that sentence.
- **Run.** Click `Run now` on it. Within a minute `Last run` reads `judged N, M fit`. `/loops?tab=runs` shows the run `done` with its cost, and `Your shortlist` lists at most the loop's size (`shows up to 5`) with `N% match` and `✓`/`?`/`✕` lines.
- **Link.** Paste `https://cloover.jobs.personio.de/job/2317211` into `A job's link` and press Enter. Within about 10 seconds the URL gets `&job=` and the sheet opens with `you added this` and the breakdown. Click `Favorite`, then `Add to tracker`: the footer says `Added to Applications as saved.`, the `Saved` list shows `★ favorite · in your tracker`, and `/` lists Cloover.
- **Jobs.** `navigate` to `/jobs`: the intro counts roles and boards. Search `developer tools`, press Enter: the URL gets `?q=developer+tools`. Click the `Remote only` label: `&remote=true`, and every row says remote. Click the `Compact` label: `&compact=true`, one line per role in columns. Click `More like this`: the search becomes that role's title.
- **Log.** Read the deployment's logs (the Convex MCP `logs` tool or the dashboard): an `[INFO]` line holds `"work":"loop.run"`, `"outcome":"done"`, `judged`, `fits` and `costUsd`.
- **Steps.** On `/loops?tab=loops&template=custom`, click `Remote only`: step 3's search words end in `remote` and step 5 lists `Roles that aren't remote`. Turn off the first switch (`Run by itself every morning`): step 1 reads `Only when you press Run now`.
- **Run now limit.** A fourth `Run now` in a day says `You've run loops by hand 3 times today.`

## Gotchas

- `Run now` refuses while the loop's last run is still `queued` or `running`, and after 3 runs by hand in a day. The limit's window starts at the first run, so it reopens 24 hours later, not at midnight.
- The catalog fills on its own: the hourly `refresh job boards` cron seeds the starter boards on a fresh deployment and fetches them within a minute or two. `jobs:stats` shows the count.
- Jev goes through the Convex AI gateway, which needs a paid Convex Cloud plan; on a local backend `judgeOne` fails and the run notes how many roles Jev couldn't judge.
- Switches are named through `aria-labelledby`, which `find` doesn't resolve, and clicking the hidden checkbox misses; click the label text next to it.
- Judgments and board fetches go through the `readPool` workpool; the Convex dashboard's readPool component shows them queued and running.
