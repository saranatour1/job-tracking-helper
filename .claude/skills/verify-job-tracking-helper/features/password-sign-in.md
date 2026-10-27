# Password sign-in

A user can create an account with a username and password, sign out, and sign back in. Bad input shows a plain-language error under the form.

## Sub-features

- `pw-sign-up` creates an account and opens the dashboard.
- `pw-sign-in` signs an existing account back in.
- `pw-toggle` switches the form between `Sign in` and `Create an account` and clears any error.
- `pw-wrong-password` shows `Wrong username or password.`
- `pw-username-taken` shows `That username is taken.`
- `pw-too-short` shows `Password is too short.`

## How to get to it (user POV)

- Open `http://localhost:3000/sign-in`, or any page while signed out, which redirects there.
- Open `http://localhost:3000/sign-up`, or follow the `Need an account? Sign up` link. `Have an account? Sign in` links back.
- Signed-in users who open either page are sent to `/`.

## Driving it with Claude Browser

Preconditions:

- Baseline preconditions hold.
- A fresh username and password are written to `$dir/credentials.txt`, as the skill's Test accounts section describes.

- **Snapshot before.** Run `evidence.sh table "$dir" users before`.
- **Switch to sign-up.** `find` `"Need an account? Sign up"`, a link to `/sign-up`, and click it. The URL is `/sign-up`, the heading reads `Create an account`, and the submit button reads `Sign up`.
- **Too-short password.** Fill `Username` with the fresh username and `Password` with `abc`, then click `Sign up`. The alert reads `Password is too short.` and the heading is unchanged.
- **Sign up.** Fill `Password` with the fresh password and click `Sign up`. The `Applications` heading appears. Save it as `01-signed-up.txt`.
- **Side effect.** Run `evidence.sh table "$dir" users after-sign-up`. The count is the before count plus one.
- **Sign out.** Click `Sign out`. The `Sign in` heading returns.
- **Wrong password.** Fill the fresh username and a different password, then click `Sign in`. The alert reads `Wrong username or password.`
- **Sign in.** Fill the fresh password and click `Sign in`. The `Applications` heading appears. Save it as `02-signed-in.txt`. Run `evidence.sh table "$dir" users after-sign-in`. The count is unchanged from after-sign-up, because sign-in creates no user.
- **Username taken.** Sign out, switch to sign-up, and submit the same username with any valid password. The alert reads `That username is taken.`
- **Switching pages clears the error.** Choose the `Have an account? Sign in` link. The URL is `/sign-in`, and the alert is gone.

## Gotchas

- Repeated failures trigger `Too many attempts. Try again in a minute.` Keep wrong attempts to one or two per run.
- Usernames with spaces or symbols are rejected as invalid characters. Use letters and digits.
- Both fields are `required`. An empty submit is blocked by the browser, so no alert renders. That's expected, not a failure.
- The password field's `autocomplete` switches between `current-password` and `new-password` with the mode. Don't assert on autofill.
