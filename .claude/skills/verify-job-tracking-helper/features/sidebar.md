# Sidebar

Signed-in users get a left sidebar with an `Applications` link and a `Sign out` button. It collapses to icons and expands again from the header button or the keyboard.

## Sub-features

- `sidebar-toggle-button` collapses and expands it with `Toggle Sidebar`.
- `sidebar-toggle-key` toggles it with `Cmd+B` on macOS or `Ctrl+B` elsewhere.
- `sidebar-nav` navigates to `/` with the `Applications` link.
- `sidebar-sign-out` returns to the sign-in form.

## How to get to it (user POV)

- Sign in by any method. The sidebar sits at the left edge of the dashboard.

## Driving it with Claude Browser

Preconditions:

- Signed in. Use Guest sign-in, which is the fastest.
- The viewport is desktop width, 768px or more. Below that, the sidebar becomes a sheet. See Gotchas.

- **Read the start state.** Run `javascript_tool` with `document.querySelector('[data-slot="sidebar"][data-state]').dataset.state`. It returns `expanded`.
- **Collapse by button.** `find` `"Toggle Sidebar"` and click the `button` match. The `generic` match is the rail. Read the state again: `collapsed`. The `Applications` label is hidden, and only icons remain.
- **Expand by button.** Click `Toggle Sidebar` again. The state is `expanded`.
- **Toggle by key.** Run `computer` `key` `cmd+b`. The state flips. Press it again to restore.
- **Nav.** `find` `"Applications"` (the link) and click it. The URL is `http://localhost:3000/` and the `Applications` heading shows.
- **Proof.** Save each `data-state` reading with its action in `steps.md`, and copy a screenshot of the collapsed state into the evidence dir.
- **Sign out.** Click `Sign out`. The `Sign in` heading returns.

## Gotchas

- The open or closed state is saved in a `sidebar_state` cookie, so a reload keeps whatever the last run left. Read the state first, and don't assume `expanded`.
- At mobile width, `Toggle Sidebar` opens a sheet dialog, and `data-state` on the desktop root doesn't change. Resize to desktop with `resize_window` `preset: "desktop"` before driving.
- `Cmd+B` only reaches the page when the pane has focus. Click the page body first if the key does nothing.
