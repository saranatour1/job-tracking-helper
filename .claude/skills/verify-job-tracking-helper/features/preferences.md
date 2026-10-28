# Preferences

`/preferences` asks people what they want from their next job in their own words, one section at a time: interests, things to avoid, growth, places and work mode, companies, red flags, who they are, six common application questions, their own question and answer pairs, and an optional resume. A side panel shows the profile blocks and a one-line summary per section. Returning users open on an `Overview` tab that lists every answer by section as settings-style rows; clicking a row (named `Edit <label> <value>`) opens that step. Another tab, `Prefilled`, shows form fields as label and value rows in dashed section tiles, laid out as a grid: Contact, Work, About you and the person's own questions to start, suggested from the account and answers until first saved. Sections and fields can be added, renamed and removed, and `Save prefilled` stores them on its own, one `profileEntries` row per field with kind `field`. Settings (work mode, resume) are one `preferences` row per user; each tag is a `preferenceTags` row and each answer a `profileEntries` row with kind `answer`. The page loads tags and entries through paginated queries and opens the form once every page has arrived. A save rewrites only the tag lists, questions or sections that changed, and `users.onboardedAt` records that first run is done. A copy-paste prompt lets them fill the form with their own AI assistant.

## Sub-features

- `prefs-first-run` sends a new account from `/` to `/preferences` until they save or click `Skip for now`.
- `prefs-save` stores the answers; they come back after a reload, and `Skip for now` disappears.
- `prefs-prefill` fills the form from an assistant's JSON reply, even inside a code fence, and drops unknown fields.
- `prefs-prefill-error` shows a message for a reply with no JSON, broken JSON, or a wrong value such as `"workMode": "sometimes"`.
- `prefs-resume` uploads one PDF, Word or text file, refuses other types, and replaces the old file on a new upload.
- `prefs-blocks` shows one coloured block per filled part; its `role="img"` label reads `Your profile: N of 9 parts filled in`.
- `prefs-steps` moves between sections with `Back`/`Next`, the side panel's section buttons, the mouse wheel past the end of a section, or a vertical drag of more than 80px away from fields and buttons.
- `prefs-own` adds, edits and removes your own question and answer pairs under `Your own questions`.
- `prefs-prefilled` saves sections of label and value rows, refuses a label used twice in a section or a section title used twice, and keeps the other answers untouched.

## How to get to it (user POV)

- Sign up or continue as a new guest: the app opens on Preferences.
- Afterwards, choose `Preferences` in the sidebar.

## Driving it with Claude Browser

Preconditions:

- A fresh guest account, so `prefs-first-run` applies.

Steps:

- **First run.** Continue as guest. The URL is `/preferences` and `Skip for now` shows next to `Save preferences`.
- **Prefill.** On step 1, `find` `"Paste the reply"` and fill it with a sentence followed by a JSON object, such as `Here you go: {"interests":["climate"],"workMode":"remote","answers":{"pay":"60k EUR"},"extra":1}`. Click `Fill the form`. A status reads `Filled 3 answers`, and the side panel's `What you're drawn to` line reads `climate`.
- **Prefilled.** Open the `Prefilled` tab. `Salary expectation` reads `60k EUR`. Rename `Contact label 3` to `email` and click `Save prefilled`: the status reads `"email" is listed twice`. Rename it back, click `Add section`, title it `References`, fill `References label 1` and its value, and save: the status reads `Saved.` and `evidence.sh table "$dir" profileEntries` shows a `field` row with group `References`. Rows' copy and remove buttons appear on hover.
- **Save.** Click `Save preferences`. A status reads `Saved.` and `Skip for now` is gone. Run `evidence.sh table "$dir" preferences after-save`: there is one row for this user. `evidence.sh table "$dir" preferenceTags after-save` has one row per tag.
- **Persist.** Navigate to `/`: the URL stays `/`. Navigate back to `/preferences`: it opens on `Overview`, and the answers are still there.
- **Overview.** `find` `"When could you start"` and click it: the `Edit` tab opens on `Step 8 of 10`. Then add a company on step 5. Add a company, go back to `Overview`: it shows there before saving.
- **Resume.** `form_input` can't set files. Use `javascript_tool` to put a `File` into `#resume` through a `DataTransfer` and dispatch `change`. A `.png` shows `Upload a PDF, Word or plain text file.`; a `.pdf` shows its name as a link with `Remove`.

## Gotchas

- `form_input` turns a value that is pure JSON into `[object Object]`. Start the reply with a few words so it stays a string.
- Each section mounts only when it's shown, so `find` can't reach a field on another step. Move there first.

- The page fades in, so a screenshot taken right after a redirect can come out blank. Wait a second.
- The page scrolls inside a coss scroll area, not the window. Scroll with the mouse over the page margin, or call `scrollIntoView` on a heading.
