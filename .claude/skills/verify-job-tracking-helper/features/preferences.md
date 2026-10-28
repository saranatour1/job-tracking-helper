# Preferences

`/preferences` asks people what they want from their next job in their own words: interests, things to avoid, growth, places and work mode, companies, red flags, who they are, six common application questions, and an optional resume. Answers are stored in the `preferences` table, one row per user, and `users.onboardedAt` records that first run is done. A copy-paste prompt lets them fill the form with their own AI assistant.

## Sub-features

- `prefs-first-run` sends a new account from `/` to `/preferences` until they save or click `Skip for now`.
- `prefs-save` stores the answers; they come back after a reload, and `Skip for now` disappears.
- `prefs-prefill` fills the form from an assistant's JSON reply, even inside a code fence, and drops unknown fields.
- `prefs-prefill-error` shows a message for a reply with no JSON, broken JSON, or a wrong value such as `"workMode": "sometimes"`.
- `prefs-resume` uploads one PDF, Word or text file, refuses other types, and replaces the old file on a new upload.
- `prefs-blocks` shows one coloured block per filled part; its `role="img"` label reads `Your profile: N of 8 parts filled in`.

## How to get to it (user POV)

- Sign up or continue as a new guest: the app opens on Preferences.
- Afterwards, choose `Preferences` in the sidebar.

## Driving it with Claude Browser

Preconditions:

- A fresh guest account, so `prefs-first-run` applies.

Steps:

- **First run.** Continue as guest. The URL is `/preferences` and `Skip for now` shows next to `Save preferences`.
- **Prefill.** `find` `"textbox"` and fill the one whose placeholder starts with `Paste the reply` with a JSON object such as `{"interests":["climate"],"workMode":"remote","answers":{"pay":"60k EUR"},"extra":1}`. Click `Fill the form`. A status reads `Filled 3 answers`, and the Interests field shows a `climate` chip.
- **Save.** Click `Save preferences`. A status reads `Saved.` and `Skip for now` is gone. Run `evidence.sh table "$dir" preferences after-save`: there is one row for this user.
- **Persist.** Navigate to `/`: the URL stays `/`. Navigate back to `/preferences`: the answers are still filled.
- **Resume.** `form_input` can't set files. Use `javascript_tool` to put a `File` into `#resume` through a `DataTransfer` and dispatch `change`. A `.png` shows `Upload a PDF, Word or plain text file.`; a `.pdf` shows its name as a link with `Remove`.

## Gotchas

- The page fades in, so a screenshot taken right after a redirect can come out blank. Wait a second.
- The page scrolls inside a coss scroll area, not the window. Scroll with the mouse over the page margin, or call `scrollIntoView` on a heading.
