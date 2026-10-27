# Guest sign-in

A signed-out user can choose `Continue as guest` to get an anonymous account with no username or password, which lands them on the dashboard.

## Sub-features

- `guest-start` creates an anonymous user and shows the dashboard.
- `guest-persist` keeps the guest signed in across a page reload.
- `guest-sign-out` returns the guest to the sign-in form.

## How to get to it (user POV)

- Open `http://localhost:3000/` while signed out and choose `Continue as guest`.

## Driving it with Claude Browser

Preconditions:

- Baseline preconditions hold, and the `Sign in` heading is visible.

- **Snapshot before.** Run `evidence.sh table "$dir" users before`. Note the count.
- **Start as guest.** Run `find` with `"Continue as guest"`, then `left_click` the ref. The `Applications` heading and the `Toggle Sidebar` button appear, and the `Sign in` heading is gone.
- **Save state.** Run `get_page_text` and save it as `01-dashboard.txt`. It contains the `Applications` heading and the `Company`, `Role`, and `Status` column headers.
- **Side effect.** Run `evidence.sh table "$dir" users after`. The count is the before count plus one.
- **Reload.** Run `navigate` to `http://localhost:3000/`. The `Applications` heading shows again with no sign-in form, which proves `guest-persist`.
- **Sign out.** `find` `"Account menu"` and click it, then `find` `"menuitem"` and click `Sign out`. The `Sign in` heading returns. Save it as `02-signed-out.txt`.

## Gotchas

- On first load, the page briefly renders neither the dashboard nor the form while Convex Auth checks the session. Wait for a heading.
- Sign-out can take over 2 seconds. Wait for the `Sign in` heading before reading the page.
- A guest who signs out can't get back into the same account. Each `Continue as guest` makes a new user, so the count goes up by one every time.
- If the button does nothing and an alert reads `Something went wrong. Try again.`, the anonymous component isn't deployed. Run the doctor.
