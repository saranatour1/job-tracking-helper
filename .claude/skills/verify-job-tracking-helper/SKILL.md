---
name: verify-job-tracking-helper
description: Launch and drive the Job Tracking Helper web app (TanStack Start on localhost:3000, Convex dev backend) in the Claude Browser pane to prove a user-facing change works, with text evidence saved to .verify-evidence/. Use after changing sign-in, the sidebar, the applications table or form, or anything under convex/, and whenever asked to verify, demo, or check the app.
---

# Verify Job Tracking Helper

The app is a web UI. Users sign in (username and password, guest, or Google/GitHub when configured), then land on a dashboard with a collapsible sidebar and an Applications table with an add form. A brand-new account lands on Preferences first; `Skip for now` or saving there sends later visits to Applications. The backend is a Convex **cloud dev deployment** named in `.env.local` (`CONVEX_DEPLOYMENT`). There is no other surface to drive.

Driving uses the Claude Browser tools (`mcp__Claude_Browser__*`). The pane has its own cookies and storage, so signing in there never touches the user's own browser session.

Feature recipes live in [features/README.md](features/README.md). Read the index, then the feature file for what you changed.

## Isolation: one instance only

The port is fixed at 3000 (`scripts/dev.sh` runs `vp dev --port 3000`), and every instance pushes to the same Convex deployment. Two instances can't run side by side.

- If the doctor passes, an instance is already up, usually the user's own `vp run dev`. Drive it, and record `STARTED=no`. Never stop it.
- Start one only when nothing listens on port 3000.

## Launch

1. Run the doctor (below). If all checks pass, skip to Drive with `STARTED=no`.
2. If the only failures are the port and the page, start the app with `mcp__Claude_Browser__preview_start` and `name: "dev"`. It reads `.claude/launch.json`, which runs `vp run dev`. Keep the returned `serverId`, and record `STARTED=yes`.
3. Watch `mcp__Claude_Browser__preview_logs` with `search: "ready"`. The app is ready when two lines have appeared: `Convex functions ready!` and a Vite line naming `http://localhost:3000/`. An HTTP answer alone isn't ready. The first push after a backend change can take 10 to 20 seconds.
4. Record the vite pid: `lsof -tiTCP:3000 -sTCP:LISTEN`. Cleanup needs it.
5. Run the doctor again. It must pass before you drive.

**First run on a fresh clone.** These steps need the user, because `convex dev` asks them to log in and pick a project interactively:

- `vp install`
- `vp run dev` in their own terminal, once, to link the deployment and write `.env.local`
- `pnpm exec convex env set SITE_URL=http://localhost:3000`
- `pnpm exec auth`, which generates `AUTH_PRIVATE_KEY` and `AUTH_JWKS`

`scripts/dev.sh` then fills the four Google and GitHub variables with `disabled` on every start. If the doctor reports `.env.local` or an env var missing, stop and give the user the matching step. Don't run login flows yourself.

No seed step exists. The Convex `users` table fills as people sign in, and each user starts with an empty Applications table.

## Doctor

```bash
.claude/skills/verify-job-tracking-helper/scripts/doctor.sh
```

It is read-only and prints one `ok` or `FAIL` line per check, exiting 1 on any failure. It checks five things:

- Something listens on port 3000, and it shows that pid and its parent.
- `http://localhost:3000/` serves `<title>Job Tracking Helper</title>`.
- `.env.local` names a deployment.
- `SITE_URL`, `AUTH_PRIVATE_KEY`, and `AUTH_JWKS` exist. It checks names only and never prints values.
- The deployment serves `auth:signInAnonymously`.

Vite serves source directly, so a passing doctor means the running UI is the working tree. Run the doctor first whenever anything looks off.

## Drive

1. Open the app: `mcp__Claude_Browser__navigate` to `http://localhost:3000/`. If `preview_start` already opened a tab, use that tab.
2. Find elements by accessible name with `mcp__Claude_Browser__find`, then act with `computer` `left_click` on the returned `ref`, or `form_input` for fields. Don't use coordinates.
3. Read state with `get_page_text` or `read_page`. Use `javascript_tool` only to read attributes the accessibility tree hides, such as the sidebar's `data-state`.

These handles are stable, all from the source:

| Where         | Handle                                                                                                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in form  | heading `Sign in` or `Create an account`; textboxes `Username` and `Password`; buttons `Sign in`, `Sign up`, `Continue as guest`, `Need an account? Sign up`, `Have an account? Sign in`; error text in `role="alert"`                                                                                        |
| OAuth buttons | `Continue with Google` and `Continue with GitHub`, rendered only when that provider's variables are real                                                                                                                                                                                                      |
| Shell         | button `Toggle Sidebar` in the header (a second, `generic` match is the sidebar rail); `Cmd+B` or `Ctrl+B`; sidebar link `Applications`; the footer button `Account menu`, which opens menu items `Account` and `Sign out`; the sidebar root `[data-slot="sidebar"][data-state]` is `expanded` or `collapsed` |
| Applications  | heading `Applications`; textboxes `company` and `role`; the `Status` combobox, a coss Select showing its current value (`Applied`, `Interviewing`, `Offer`, `Rejected`); button `Add`; table with columns `Company`, `Role`, `Status`                                                |

**Test accounts.** Generate a fresh username for each run, letters and digits only, such as `verify` plus a Unix timestamp, and a random password of 12 or more characters. Write both to `<evidence dir>/credentials.txt`. Never type a real password from anywhere else, and don't repeat the values in your reply.

## Evidence

```bash
dir=$(.claude/skills/verify-job-tracking-helper/scripts/evidence.sh new <feature-id>)
.claude/skills/verify-job-tracking-helper/scripts/evidence.sh table "$dir" users before
.claude/skills/verify-job-tracking-helper/scripts/evidence.sh table "$dir" users after
```

`new` prints a fresh directory under `.verify-evidence/`, which is gitignored. `table` saves a Convex table (`users`, `applications` or `preferences`) as JSON lines and prints the row count. A proof directory holds four kinds of file:

- `steps.md`, which you write: each user action, the tool call that did it, and what the page showed after.
- One `get_page_text` or `read_page` dump per meaningful state, saved with Write, named like `02-after-sign-in.txt`, plus a screenshot copied in for each key state.
- The `<table>-*.jsonl` snapshots, wherever the feature writes to the backend.
- `credentials.txt`, when you created an account.

Each `computer` `screenshot` result ends with an `[Image: source: <path>]` line. Copy that file into the evidence dir with a step-numbered name such as `01-dashboard.jpg`, because the source lives in session scratch space.

The proof has to meet these standards:

- **Real user path.** Click the buttons a user clicks. Never call Convex functions directly (`convex run`, `runOneoffQuery`) to stand in for a UI step.
- **Action and result.** Save the state before and after each action, not only the final screen.
- **Side effects.** A sign-in or sign-up must add exactly one row to `users`, so compare the before and after counts. An added application must add exactly one row to `applications`.
- **No mocks.** The only fake is the `disabled` OAuth placeholder that `scripts/dev.sh` sets. Real OAuth can't be verified here, as the oauth feature file explains.

## Cleanup

1. In the pane, open `Account menu` and choose `Sign out`. This resets the pane to the sign-in form for the next run.
2. If `STARTED=yes`, run `mcp__Claude_Browser__preview_stop` with the saved `serverId`. Then check `lsof -tiTCP:3000 -sTCP:LISTEN`. Stopping `convex dev` with a signal can leave vite running, so if the pid you recorded at launch is still listening, `kill <that pid>`. Kill only that pid, never by name.
3. If `STARTED=no`, leave the process alone.
4. Keep `.verify-evidence/`. Confirm the run's directory still exists and holds `steps.md`.

Accounts created during verification stay in the dev deployment. They're throwaway, so don't delete them.

## Helpers

| Script                | Run it as                                                                       | Does                                               |
| --------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| `scripts/doctor.sh`   | `.claude/skills/verify-job-tracking-helper/scripts/doctor.sh`                   | read-only health check, exits 1 on failure         |
| `scripts/evidence.sh` | `… evidence.sh new <feature-id>` or `… evidence.sh table <dir> <table> <label>` | makes an evidence dir, or snapshots a Convex table |

Both run from any directory inside the repo.
