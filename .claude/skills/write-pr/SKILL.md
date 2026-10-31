---
name: write-pr
description: Write job-tracking-helper's commit messages, PR titles and PR bodies, and squash-merge PRs. Titles and commits follow Conventional Commits 1.0.0. Bodies use the short Description / Changes / Screenshots / Additional information template, with before/after screenshots for anything visible. Use whenever you commit, open or edit a PR, or squash-merge one in this repo.
---

# Write PRs and commits

Keep every PR short enough to read in a minute. If a line doesn't help the reviewer decide, cut it.

## Commit messages and PR titles

Use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>[(scope)][!]: <description>

[body]

[footers]
```

- **type** is one of `feat` (new behavior), `fix` (bug fix), `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, or `revert`.
- **scope** is optional. Use a feature folder name, such as `auth`, `applications` or `shell`.
- **description** uses the imperative mood ("add", not "added"), lowercase, no trailing period. The whole title line stays at 72 characters or less.
- **Breaking changes** add `!` after the type or scope, plus a `BREAKING CHANGE: <what breaks>` footer.
- **body** says what changed and why, not how. Wrap it at 72 columns.
- End every commit message with the `Co-Authored-By` line the session gives you.

The PR title is the same line as the main commit's first line, such as `feat(applications): store applications in Convex`.

## PR body

Draft it from the branch's commit messages (`git log main..HEAD`), then cut it down. Use these four sections, in this order. They match `.github/pull_request_template.md`.

```markdown
## Description

One or two sentences: what this PR does and why.

## Changes

- **<type>:** <what changed> (`path/to/file-or-folder`)

## Screenshots

| Before         | After         |
| -------------- | ------------- |
| ![before](url) | ![after](url) |

## Additional information

- New env vars, scripts or dependencies.
- Anything not tested, follow-ups, or other PRs this depends on.
```

- **Description.** Say what the PR does and why, with no background story and no list of everything you tried.
- **Changes.** One bullet per change, each naming the file or folder where the change lives. Lead with the change type when a PR mixes types, such as `**fix:**` or `**feat:**`.
- **Screenshots.** Include them whenever the change is visible in the app. Leave the section out when nothing on screen changed, and never use a placeholder.
- **Additional information.** Leave the section out when it's empty. Say plainly what you didn't test.
- End the body with the attribution line the session gives you.

## Screenshots

1. **Before** you edit a visible part of the app, drive it with the verify skill (`.claude/skills/verify-job-tracking-helper`) and take a `computer` `screenshot`. If you skipped this step, show the after shot only, and don't fake a before shot.
2. **After** the change, take the same screenshot from the same state, with the same viewport.
3. Each screenshot result ends with `[Image: source: <path>]`. Copy those files into the PR's evidence folder, `.verify-evidence/<run>/`.
4. Upload them to the `pr-assets` branch, an orphan branch that only holds images:

   ```bash
   .claude/skills/write-pr/scripts/upload-screenshots.sh <pr-number> <file>...
   ```

   It prints one Markdown image link per file. Paste the links into the Screenshots table. The repo is public, so anyone can see the images. Check them for personal details first.

## Squash-merging

GitHub uses the PR title as the squash commit's subject, so the title must already follow Conventional Commits. Merge with the title and a short body:

```bash
gh pr merge <n> --squash --subject "<PR title> (#<n>)" --body "<the Description section>"
```

After merging, delete the branch and fast-forward `main`.
