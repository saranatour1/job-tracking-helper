# Security policy

Job Tracking Helper stores resumes, saved answers, mail and Cloudflare tokens, so a security bug here can expose someone's personal data. Please report it privately.

## Report a vulnerability

Use [GitHub's private reporting form](https://github.com/saranatour1/job-tracking-helper/security/advisories/new). Don't open a public issue, pull request or discussion.

Include what you found, the steps to reproduce it, and what an attacker could do with it.

This is a small project with no bug bounty. You'll get an answer as soon as someone can look at it, and credit in the advisory if you want it.

## What's covered

Only the latest code on `main` and the live site at https://ye.saranatour.dev. Older commits don't get fixes.

The most useful reports are ones where someone can:

- read or change another person's applications, resume, mail, contacts or calendar
- get a Cloudflare token or anything else the server encrypts
- make the app press Submit on a job form, which it must never do

Bugs in a dependency belong with that project, unless the way this app uses it makes things worse.

## Testing

Use accounts you created yourself. Don't touch anyone else's data, run load tests against the live site, or send phishing or spam. If you reach someone else's data by accident, stop, don't keep a copy, and say so in your report.
