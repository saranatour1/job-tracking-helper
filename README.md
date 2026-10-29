# Job Tracking Helper

Track job applications: company, role and status, saved per user.

New accounts start on Preferences, which asks what someone wants from their next job in their own words, one section at a time, and saves it to Convex. Its Overview tab lists every answer, and clicking one opens its section. Its Prefilled tab keeps the fields application forms ask for, in sections you can add, rename and remove, suggested from those words and ready to copy. A copy-paste prompt lets them fill it with their own AI assistant. A resume upload is optional, kept only to attach to applications, and never read.

Jobs lists every open role in a shared catalog, built from the free feeds of company job boards (Greenhouse, Lever, Ashby, Personio) and refreshed daily. Search it, keep to remote roles, switch to a compact list, or find more like any role.

Loops pick roles from that catalog each morning, for every kind of role you describe in each of your places. Jev judges each one against your Preferences through the Convex AI gateway and says what fits, what could and what doesn't. Only a few fits at a time reach your shortlist; save, favorite, dismiss or add each to your tracker, and tomorrow's runs learn from it. Paste any job's link to have it checked the same way. Jev needs no key, but the gateway needs a paid Convex Cloud plan. To find new boards, a run searches Firecrawl or context.dev when `FIRECRAWL_API_KEY` or `CONTEXT_DEV_API_KEY` is in the Convex env (`pnpm exec convex env set FIRECRAWL_API_KEY ...`); without one, runs judge roles from the boards already known.

Account connects your own Cloudflare account, so emails can go out from your domain. Paste an account ID and an API token: the token is checked with Cloudflare, encrypted with AES-256-GCM under a key only the server holds, and locked: it never comes back to the browser, and changing the account or address reuses it on the server. Replacing it checks the new one before the old one goes. A test email shows it works. With your OK, the app also sets up incoming mail: it deploys a small Worker and a routing rule for your address (Email Routing must already be on, since it takes over the domain's MX records), and each email arrives at `/email/inbound/<id>`, sealed the same way. Each email is then filed under the application it's about (by company name, or by Jev when you let it read your mail) in that application's timeline: what it said, a portal link to check your status, a suggested status change you confirm, and the email itself to read. A reply follows its thread: it goes under the same application as the email it answers, matched by a hash of the Message-ID postal-mime reads, never the ID itself. Mail that matches nothing waits in Unsorted, in the Applications toolbar.

Calendar (`/calendar`) puts every date in one place, in [kloq](https://coss.com/kloq): when you applied, each status change and email, interview slots read from invites ("Tue, Nov 3 at 10:30 AM PT"), follow-ups, and events you add by dragging on the grid, typing in ⌘K or importing an invite's .ics. Click an event for kloq's panel, where the Calendar row is its application; double-click opens the application. Interview slots and follow-ups can be moved, which saves a fix in their place; your events and fixes are kept in Convex (`calendarEvents`) and link to an application when their title names its company. The Timeline view has a row per application, and dragging between rows relinks. Beside the grid: a month, filters by kind and a list by day or by application. Times follow your zone from Account → Calendar (with up to three more beside the hours); an interview keeps the zone its email or invite gave. The view, date, filters and grouping stay in the URL.

Booking pages (Account → Booking pages) are links like `/book/<code>` you send a recruiter. Each has a title, a length, the days and hours it's open in your zone, how much notice it needs, and optionally the application it's for. The page shows your free time in the guest's zone, with yours beside it, and hatches the rest: your Calendar events and the interview slots your mail proposed (only the times leave the server). The server checks each booking again, allows one upcoming booking per email, and puts it on your Calendar as an interview, under the page's application or the one matching the guest's email domain, with a note in the Inbox. The guest gets an .ics file for their own calendar.

The Inbox shows what happened: new mail about your applications, mail that needs filing, new bookings, and new roles from loops. Each kind can be turned off under Account → Notifications. It reads from the notifications component in `convex/notifications`.

Applications (`/`) shows your applications from Convex as a board or a list, one column per status; drag a card to another column to move it. Each has a code like APP-12. Jobs added from a loop arrive with their location, a Remote label, the posting's summary and a priority from Jev's match; add one yourself with its link and Jev checks it the same way, filling in only what you left empty. With "Let Jev move cards" on (Account, off by default), a clear interview, offer or rejection email moves the card itself, with an undo. Each card shows its latest email, and its side panel has the details (status, priority, labels, how you applied, location, tasks) and one timeline of status changes, notes and company mail. New application adds one. Everything about the board lives in the URL (the view, tab, filters, display options and the open application), so a reload or a shared link opens it as it was. Right-click a card to open it, move it or find related roles in Jobs; right-click a view's tab to copy or delete it; right-click the board to save what's on screen as a view or jump to Jobs, Preferences, Calendar or Inbox. Views save to Convex. Goals use the same board but still run on sample data from `src/features/tracker/data.ts`.

## How to run

Needs [Vite+](https://viteplus.dev) (`vp`) and pnpm.

```bash
vp install
vp run dev
```

The app opens at http://localhost:3000. `vp run dev` starts Convex and the frontend together.

The first run asks you to log in to Convex and pick a project. After that, set these once:

```bash
pnpm exec convex env set SITE_URL=http://localhost:3000
pnpm exec auth
```

Username/password and guest sign-in work right away. For email, give the server an encryption key once:

```bash
pnpm exec convex env set SECRETS_KEYS "v1:$(openssl rand -base64 32)"
```

To rotate it, append a new key (`v1:...,v2:...`), run `pnpm exec convex run email:resealAll`, then remove the old one. The Google and GitHub buttons work once their keys are in Convex:

1. In 1Password, add an item `job-tracking-helper` to your Private vault, with fields `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, `AUTH_GITHUB_CLIENT_ID` and `AUTH_GITHUB_CLIENT_SECRET`.
2. Run `vp run secrets:push`. Set `OP_VAULT` to use another vault.

Checks:

```bash
vp check
vp run typecheck
vp test
sh scripts/push-secrets.test.sh
```

## Folder structure

```
convex/
  <feature>.ts                         registers api.<feature>.* (auth.ts, applications.ts)
  api/features/<feature>/
    models.ts                          the feature's tables
    validators.ts                      arktype rules, safe to import from the frontend
    public.ts                          functions the frontend calls
    internal.ts                        functions only this feature calls
    utils.ts                           helpers used only here
    index.ts                           collects public and internal into one object
  cloudflareEmail/                     local component: sends through Cloudflare and keeps the emails
  notifications/                       local component: each person's inbox feed and muted kinds
  lib/                                 shared helpers: arktype to Convex, signed-in builders, secrets
  schema.ts                            collects each feature's tables
src/
  routes/                              pages (TanStack Router); they only import a feature
    _app.tsx, _auth.tsx                layouts: signed-in pages, and /sign-in + /sign-up
  features/<feature>/                  the feature's components
  features/tracker/                    Applications and Views on Convex; Goals on sample data for now
  features/preferences/                Preferences: the form, the assistant prompt and the profile blocks
  features/jobs/                       Jobs: the shared catalog of open roles
  features/loops/                      Loops: morning job searches, their runs and sources
  features/account/                    Account: profile, email connection, notifications, theme, sign-out
  features/inbox/                      Inbox: notifications from mail and loops
  features/calendar/                   Calendar: dates from applications and mail, your events, the side list and settings
  features/booking/                    Booking pages: the public page guests book on, and their settings
  components/ui/                       shadcn/coss components, managed by the shadcn CLI
  components/kloq/                     the kloq calendar as source, from its registry
scripts/                               dev and secrets scripts
docs/database-design.md                planned tables, status flow and build order
.claude/skills/verify-job-tracking-helper/   how an agent launches, drives and checks the app
.claude/skills/write-pr/             how an agent writes commits and PRs
```

Code rules, enforced by `vp check`: arrow functions only, no `useEffect`. Files the shadcn CLI manages are exempt, and `src/components/kloq` is skipped by lint and format. Frontend imports use `@/` for `src/` and `@convex/` for `convex/`.

## Tools

| Area          | Used                                                            |
| ------------- | --------------------------------------------------------------- |
| Toolchain     | Vite+ (`vp`): dev server, build, lint, format                   |
| Frontend      | React 19, TanStack Start, Router, Table and Form                |
| UI            | Tailwind CSS v4, shadcn CLI with coss ui (Base UI), Hugeicons   |
| Backend       | Convex, Convex Auth v2, convex-helpers                          |
| AI            | Jev (TypeSafe) via the Convex AI gateway and the AI SDK         |
| Validation    | arktype, shared by the form and the `applications:add` mutation |
| Type checking | tsrs                                                            |
| Convex lint   | `@convex-dev/eslint-plugin` recommended rules, loaded by oxlint |
| Secrets       | 1Password CLI (`op`)                                            |

Made for this repo:

- `scripts/dev.sh` runs Convex and Vite together. It fills in missing Google and GitHub keys with `disabled`, so Convex starts without them. Those two buttons fail until real keys are pushed.
- `scripts/push-secrets.sh` copies the OAuth keys from 1Password into Convex without printing them or writing them to disk.
- `convex/lib/functions.ts` has function builders that require sign-in and check arguments with arktype.
- `convex/lib/secrets.ts` encrypts pasted secrets with AES-256-GCM, bound to their owner, with versioned keys for rotation.
- `convex/cloudflareEmail` is the `@sarant/cloudflare-email` component, changed so each person sends with their own token and no token is ever stored in a scheduled call.
- `convex/lib/ark.ts` turns arktype types into Convex validators (`arkToConvex`, `arkOutputToConvex`, `arkId`), so tables and args are defined once in arktype.
- `.claude/skills/verify-job-tracking-helper` is an agent skill with a health check, an evidence helper and step-by-step checks for each feature.
- `.claude/skills/write-pr` is an agent skill for Conventional Commits titles and short PR bodies, matching `.github/pull_request_template.md`. Its script uploads screenshots to the `pr-assets` branch.
