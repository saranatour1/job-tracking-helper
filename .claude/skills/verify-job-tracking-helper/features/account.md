# Account

A signed-in user can edit their name, email and custom username, upload or remove a profile image, and delete their account.

## Sub-features

- `account-edit` saves name, email and username, trimmed. An empty field means "not set".
- `account-validate` shows `email must be an email address` and `userName must be 3 to 39 letters, numbers, hyphens or underscores`.
- `account-username-taken` shows `That username is taken.` when another user has it.
- `account-image` uploads an image of 5 MB or less, shows it, and removes it with `Remove`. Non-images show `Upload an image file.`
- `account-delete` deletes the user's applications and image, clears their profile and sign-in username, and signs them out.

## How to get to it (user POV)

- Open `Account menu` in the sidebar footer and choose `Account`, or open `http://localhost:3000/account`.

## Driving it with Claude Browser

Preconditions:

- Signed in as a fresh guest.

- **Edit.** `find` `"textbox"` returns `Name`, `Email` and `Username`. `form_input` the values, `find` `"Save"`, and click it. `Saved.` shows in a `role="status"` element. Reload: the fields keep the values.
- **Validate.** Submit `nope` as the email and `a b` as the username. Both errors show, and nothing is saved.
- **Username taken.** Save a username, sign out, sign in as a new guest, and save the same username. `That username is taken.` shows.
- **Image.** The native file picker can't be driven. In `javascript_tool`, build a PNG with a canvas, put it in `#image` with `DataTransfer`, and dispatch `change`. `img[alt="Profile"]` appears with a Convex storage URL. A `text/plain` file shows `Upload an image file.` and adds nothing to `_storage`.
- **Delete.** Give the user an image and an application first. The button uses `window.confirm`, which the tools can't click. In `javascript_tool`, set `window.confirm = () => true`, then click the `Delete account` button. The `Sign in` heading returns. In `convex data users`, the row holds only `_id` and `_creationTime`. `convex data applications` has no rows with that `userId`, and the image is gone from `convex data _storage`.

## Gotchas

- `find` `"Delete account"` returns a heading and a button. Click the button.
- Deleting doesn't remove the `users` row. Convex Auth 2.0.0-beta.0 can't delete sign-in records, and it reuses the user id on the next sign-in, so the row stays empty.
- A guest can't sign back in after signing out, so username-taken needs two guests.
