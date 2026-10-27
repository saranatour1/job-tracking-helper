# OAuth buttons

The sign-in form shows `Continue with Google` and `Continue with GitHub` only when that provider has real client credentials on the deployment. In dev, `scripts/dev.sh` sets them to `disabled`, so both buttons are hidden.

## Sub-features

- `oauth-hidden` hides both buttons while the variables are `disabled`.
- `oauth-shown` shows a provider's button once its real credentials are pushed with `scripts/secrets.sh push`.
- `oauth-round-trip` covers the provider redirect back to the dashboard. Only the user can verify it.

## How to get to it (user POV)

- Open `http://localhost:3000/` while signed out and look below the `Sign in` button.

## Driving it with Claude Browser

Preconditions:

- Baseline preconditions hold.

- **Hidden in dev.** Run `get_page_text` on the sign-in form and save it as `01-form.txt`. It contains `Continue as guest` and contains neither `Continue with Google` nor `Continue with GitHub`.
- **Shown with credentials.** Do this only if the user says real credentials are pushed. Reload, then `find` `"Continue with Google"` or `"Continue with GitHub"`. The button exists.
- **Round trip.** Report it as skipped, giving the reason in Gotchas. Don't click through to a provider.

## Gotchas

- Never act on `accounts.google.com` or `github.com` sign-in pages. Signing in at a provider is the user's to do, and they have declined it in the Browser pane before.
- Button visibility comes from the `auth:oauthProviders` query, which treats unset, empty, and `disabled` as off. The buttons hide when a value is missing, not when it's wrong. A wrong client ID still shows the button and fails at the provider.
- Pushing real secrets is the user's job, through `scripts/secrets.sh`. Never set OAuth env vars yourself.
