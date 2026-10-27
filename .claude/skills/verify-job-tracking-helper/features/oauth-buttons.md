# OAuth buttons

The sign-in form always shows `Continue with Google` and `Continue with GitHub`. They work once real client credentials are pushed with `vp run secrets:push`. Until then, `scripts/dev.sh` sets the four variables to `disabled`, and a click sends the user to a provider error page.

## Sub-features

- `oauth-shown` shows both buttons on the sign-in form.
- `oauth-round-trip` covers the provider redirect back to the dashboard. Only the user can verify it.

## How to get to it (user POV)

- Open `http://localhost:3000/` while signed out and look below the `Sign in` button.

## Driving it with Claude Browser

Preconditions:

- Baseline preconditions hold.

- **Shown.** Run `get_page_text` on the sign-in form and save it as `01-form.txt`. It contains `Continue with Google`, `Continue with GitHub` and `Continue as guest`.
- **Round trip.** Report it as skipped, giving the reason in Gotchas. Don't click either button.

## Gotchas

- Never click these buttons, and never act on `accounts.google.com` or `github.com` sign-in pages. Signing in at a provider is the user's to do, and with `disabled` placeholders the click only reaches an error page.
- Pushing real secrets is the user's job, through `vp run secrets:push`, which reads them from 1Password. Never run it, and never set OAuth env vars yourself.
