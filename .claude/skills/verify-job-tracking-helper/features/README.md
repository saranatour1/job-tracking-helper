# Job Tracking Helper verification map

This directory is the maintained source for verifying the user-facing behavior of Job Tracking Helper. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- `.claude/skills/verify-job-tracking-helper/scripts/doctor.sh` passes.
- The Browser pane tab shows `http://localhost:3000/`.
- The pane is signed out, so the `Sign in` heading is visible. If it isn't, choose `Sign out` first.
- The deployment's OAuth variables are the `disabled` placeholders from `scripts/dev.sh`, unless the user says real credentials are pushed.
- An evidence dir exists from `evidence.sh new <feature-id>`.

## Driving conventions

- Find elements with `mcp__Claude_Browser__find` by the accessible name in quotes, then click the returned `ref`. Never click by coordinates.
- Fill text with `mcp__Claude_Browser__form_input` on the `ref`.
- Refs go stale when the page swaps between the sign-in form and the dashboard. Run `find` again after every sign-in, sign-out, or reload.
- Refs can also reset between separate tool calls, which fails with `ref map not initialized`. Put the `find` and the click that uses its ref in one `browser_batch`.
- Wait for a visible state, such as a heading, an alert, or a row, and not for a fixed sleep. Convex round trips take up to a second or two.
- Treat every quoted name as literal.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof is a saved `get_page_text` dump plus a screenshot copied from its `[Image: source: …]` path.
- Backend proof is the row count of the touched table (`users` or `applications`), before and after, from `evidence.sh table`.
- Record the feature ID and entry point used in `steps.md`.
- If a path can't be reached, report the attempted step and the unmet precondition.
- Don't report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then has exactly four H2 sections, in this order:

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with Claude Browser`
4. `Gotchas`

## Features

- [Guest sign-in](./guest-sign-in.md) covers `Continue as guest`, which creates an anonymous user and opens the dashboard.
- [Password sign-in](./password-sign-in.md) covers sign-up, sign-in, the mode toggle, and the wrong-password, taken-username, and short-password errors.
- [OAuth buttons](./oauth-buttons.md) covers whether the Google and GitHub buttons show, and why the round trip is user-only.
- [Sidebar](./sidebar.md) covers toggling by button and keyboard, the Applications link, and `Sign out`.
- [Applications](./applications.md) covers the table, the add form, and its validation.
- [Account](./account.md) covers editing the profile, the custom username, the profile image, and deleting the account.
