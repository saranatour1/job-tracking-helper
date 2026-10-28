# Applications

The dashboard home lists the signed-in user's job applications in a table, with Company, Role, and Status columns. A form above it adds a row, which is stored in Convex and survives reloads.

## Sub-features

- `apps-list` shows only the signed-in user's rows. A new user sees column headers only.
- `apps-validate` blocks an empty or whitespace-only company or role, and shows an error under the field.
- `apps-add` stores a row, shows it in the table, and resets the form.
- `apps-status` sets the new row's status from the select.
- `apps-persist` keeps rows after a reload.

## How to get to it (user POV)

- Sign in. A brand-new account opens on Preferences first; click `Skip for now`. After that the dashboard opens on Applications.
- From anywhere in the app, choose `Applications` in the sidebar.

## Driving it with Claude Browser

Preconditions:

- Signed in as a fresh guest, so the table starts empty. Use Guest sign-in.
- `evidence.sh table "$dir" applications before` has saved the starting count.

- **Empty list.** Run `get_page_text`. It shows the `Company`, `Role`, and `Status` headers and no rows. Save it as `01-empty.txt`.
- **Validation, empty.** `find` `"Add"` and click the button. `company must be non-empty` and `role must be non-empty` appear.
- **Validation, whitespace.** `find` `"textbox"`, which returns the `company` and `role` textboxes. `form_input` three spaces into company and `Designer` into role, then click `Add`. Only `company must be non-empty` shows, and the table is still empty.
- **Add.** `form_input` `  Acme  `, with surrounding spaces, into company. `find` `"combobox"` and `form_input` `offer` into it. Click `Add`. The row `Acme`, `Designer`, `offer` appears. Save it as `02-added.txt`, and copy in a screenshot.
- **Reset.** Run `javascript_tool` with `[...document.querySelectorAll('#company,#role,#status')].map(e => e.id + '=' + e.value).join(' ')`. It returns `company= role= status=applied`.
- **Side effect.** Run `evidence.sh table "$dir" applications after`. The count is one more than before, and the new row's `company` is `Acme`, with no spaces. That proves the server-side arktype check ran, because the form sends the raw value.
- **Persist.** Run `navigate` to `http://localhost:3000/`. The `Acme` row is still there.

## Gotchas

- Rows belong to the user who added them. A guest who signs out can't see their rows again. Start each run as a fresh guest instead of hunting for old rows.
- The labels render as `Company` and `Role` through CSS, and `get_page_text` shows them that way. Their accessible names are lowercase `company` and `role`. Find them with `"textbox"`, or pick the `textbox` match.
- The status select's accessible name is its current value, such as `applied`, not `Status`. Find it with `"combobox"`.
- `convex data applications` prints `There are no documents in this table.` on stderr when the table is empty. `evidence.sh` still reports `0`.
- A screenshot taken right after `Add` can catch a stale red invalid ring on company. Read `aria-invalid` with `javascript_tool` instead of trusting the frame.
