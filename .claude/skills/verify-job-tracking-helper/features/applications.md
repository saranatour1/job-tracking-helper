# Applications

The dashboard home lists job applications in a table, with Company, Role, and Status columns. A form above it adds a row once company and role are both filled.

## Sub-features

- `apps-list` shows the two sample rows, Linear and Vercel.
- `apps-add` appends a row and resets the form.
- `apps-validate` blocks an empty company or role and shows an error under the field.
- `apps-status` sets the new row's status from the select.

## How to get to it (user POV)

- Sign in. The dashboard opens on Applications.
- From anywhere in the app, choose `Applications` in the sidebar.

## Driving it with Claude Browser

Preconditions:

- Signed in, with the `Applications` heading visible.

- **List.** Run `get_page_text` and save it as `01-list.txt`. The table holds `Linear` with `Product Engineer` and `interviewing`, and `Vercel` with `Frontend Engineer` and `applied`.
- **Validation.** With both fields empty, `find` `"Add"` and click the button. `company must be non-empty` and `role must be non-empty` appear under the fields. The table still has two rows.
- **Add.** `find` `"company"`, `"role"`, and `"combobox"`. `form_input` `Acme` into the company textbox, `Designer` into the role textbox, and `offer` into the combobox. Click `Add`. A third row reads `Acme`, `Designer`, `offer`, and both error lines are gone. Save it as `02-added.txt`.
- **Reset.** Run `javascript_tool` with `[...document.querySelectorAll('#company,#role,#status')].map(e => e.id + '=' + e.value).join(' ')`. It returns `company= role= status=applied`.

## Gotchas

- Rows live in React state, not Convex. A reload drops added rows and shows only the two samples. Don't prove `apps-add` with a reload or with `convex data`.
- A Convex reconnect also drops them. When `convex dev` logs `Retrying request`, auth re-checks and the dashboard remounts. Capture the added row right after `Add`.
- The labels render as `Company` and `Role` through CSS, and `get_page_text` shows them that way. Their accessible names are lowercase `company` and `role`, and `find` returns the label, the textbox, and the table header for each. Pick the `textbox` match.
- The status select's accessible name is its current value, such as `applied`, not `Status`. Find it with `"combobox"`.
