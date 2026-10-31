# Job Tracking Helper

A job search app. It finds roles that fit what you asked for, fills in their application forms and keeps track of what you sent. It never presses Submit. You do that yourself, in a browser on the page.

## What's in it

- **Preferences.** You say what you want from your next job in your own words, one section at a time. Saved answers holds what forms keep asking for, like your phone number and LinkedIn.
- **Jobs.** Every open role from the free feeds of Greenhouse, Lever, Ashby and Personio boards. It refreshes daily, and you can search it.
- **Loops.** Morning searches of that catalog. Jev judges each role against your Preferences, and a few fits at a time reach your shortlist. What you save or dismiss shapes the next run.
- **Prefilled applications.** The app reads a posting's form and matches your saved answers. A small model drafts the job-specific questions for you to check. The real form then opens beside your answers, already filled in.
- **Applications.** A board or a list, one column per status. Each application has one timeline of status changes, notes and mail.
- **Mail.** Connect your own Cloudflare account to send from your domain and receive replies. Each company can have its own address, like `you+hooli@yourdomain`, so mail lands in the right place, and you can write and reply from an application. Anything unmatched waits in Unsorted.
- **Email.** Inbox, Sent, Drafts, Archived, Trash and labels, a page at a time, with a Tiptap editor and reusable templates. An open email shows the rest of its thread, and its addresses, subject and date copy with a click.
- **Contacts.** The people from your application mail, by company, with who you've emailed most marked. Copy, edit, add or remove any of them, or add someone from an email.
- **Calendar.** Application dates, interview times read from emails and invites, follow-ups and your own events.
- **Booking pages.** Links like `/book/<code>` to send a recruiter. They show your free time in the guest's zone, and a booking lands on your Calendar.
- **Workflows.** A trigger and up to 20 steps, built on a canvas. Workflows are data, never code. See [docs/workflows.md](docs/workflows.md).
- **Activity.** Your account since you joined: what you changed, what the app did for you, and a Failed view that says why anything failed. Each row comes from the same [evlog](https://www.evlog.dev/) event as the logs.
- **Goals, Views and Updates.** Milestones with applications attached, saved board views, and what just happened.

[docs/flows.md](docs/flows.md) covers every flow in detail.

## What happens to your data

Your resume file only gets attached to applications until you press Review on the Resume page. After that, AI drafts use its text with your email and phone removed, through endpoints that keep no data.

Demographic questions are never answered or stored, and neither are job-site passwords. Pasted tokens and email contents are encrypted with AES-256-GCM, under a key only the server holds.

## How to run

You need [Vite+](https://viteplus.dev) (`vp`) and pnpm.

```bash
vp install
vp run dev
```

The app opens at http://localhost:3000, with Convex running alongside it. The first run asks you to log in to Convex and pick a project. Then set these once:

```bash
pnpm exec convex env set SITE_URL=http://localhost:3000
pnpm exec auth
```

Username and password sign-in and guest sign-in now work. Email needs an encryption key:

```bash
pnpm exec convex env set SECRETS_KEYS "v1:$(openssl rand -base64 32)"
```

To rotate it, append a new key (`v1:...,v2:...`), run `pnpm exec convex run api/email:resealAll`, then remove the old one.

### Optional keys

- **AI.** Jev and the drafts go through the Convex AI gateway. It needs no key, but it does need a paid Convex Cloud plan.
- **Firecrawl.** Prefilled applications need `FIRECRAWL_API_KEY` in the Convex env. Loops also use it to find new boards.
- **context.dev.** `CONTEXT_DEV_API_KEY` is another way for loops to find new boards. With neither key, loops only judge roles from boards they already know.
- **Google and GitHub sign-in.** Add an item called `job-tracking-helper` to your Private vault in 1Password, with fields `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, `AUTH_GITHUB_CLIENT_ID` and `AUTH_GITHUB_CLIENT_SECRET`. Then run `vp run secrets:push`. Set `OP_VAULT` to use another vault.

### Checks

```bash
vp check
vp run typecheck
vp test
sh scripts/push-secrets.test.sh
```

## Folder structure

```
convex/
  api/<feature>.ts        registers each feature's functions, since a file's path is its API name
  features/<feature>/
    models.ts             the feature's tables
    validators.ts         shapes, rules and limits, safe to import from the frontend
    public.ts             functions the frontend calls
    internal.ts           functions only the backend calls
    utils.ts              what those functions share
    index.ts              collects public and internal into one object
  components/             local components: cloudflareEmail and notifications
  lib/                    arktype to Convex, signed-in function builders, secrets
src/
  routes/                 pages, which only import a feature
  features/<feature>/     the feature's components. Applications, Views and Goals are in tracker/
  components/ui/          shadcn and coss components, managed by the shadcn CLI
  components/kloq/        the kloq calendar as source, from its registry
  lib/api.ts              `api`, the functions in convex/api. Import it instead of the generated one
  lib/route-ids.ts        regular text for routes, instead of table ids
scripts/                  dev and secrets scripts
docs/
  database-design.md      the tables, what deleting does, and how to change what's stored
  flows.md                every user and agent flow, per feature
  workflows.md            workflows in depth
.claude/skills/           how an agent runs the app and checks it, and writes commits and PRs
```

## Code rules

`vp check` enforces arrow functions only and no `useEffect`. It skips `src/components/kloq` and files the shadcn CLI manages. Frontend imports use `@/` for `src/` and `@convex/` for `convex/`.

Routes use regular text, not table ids: `/pipeline/app-4`, `/prefilled/engineer-figma`, `/email?open=oct-31-3-10-pm`. `src/lib/route-ids.ts` turns ids into text and back. Email, drafts, runs and Updates use their date, so a private subject never reaches a URL.

Lists you scroll through read with `.paginate` and `usePaginatedQuery`, not a big `.take` or `.collect`. A read that needs every row to be right, like the board's columns, keeps a limit, listed in [docs/database-design.md](docs/database-design.md).

Convex loads a function's whole file and its imports on every run that isn't cached, so imports decide how fast it is. Function files don't import `schema`: `docOf` builds a return validator from one table (`convex/lib/docs.ts`). Keep heavy packages, like the AI SDK, out of the helpers that plain reads share, and put actions that need them in their own `convex/api` file, as the `*Actions` files there do.

Anything that can delete many rows goes through `startDelete` (`convex/features/deletes/`), which uses the batch worker.

Tests that run Convex functions are named `*.convex.test.ts` and use `convex-test`.

Arguments use arktype when text has rules Convex can't check, like trimming or lengths. Ids, booleans and fixed choices use `v`. A validator that reads `schema.doc` stays beside its function, because `schema.ts` imports `validators.ts`.

## Tools

| Area          | Used                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| Toolchain     | Vite+ (`vp`) for the dev server, build, lint and format                 |
| Frontend      | React 19, TanStack Start, Router, Table and Form, Tiptap                |
| UI            | Tailwind CSS v4, shadcn CLI with coss ui, Hugeicons, kloq, React Flow   |
| Backend       | Convex, Convex Auth v2, convex-helpers, batch worker for big deletes    |
| AI            | Jev and Gemini Flash Lite, through the Convex AI gateway and the AI SDK |
| Forms and web | Firecrawl                                                               |
| Validation    | arktype                                                                 |
| Type checking | tsrs                                                                    |
| Convex lint   | `@convex-dev/eslint-plugin`, loaded by oxlint                           |
| Secrets       | 1Password CLI (`op`)                                                    |

Some of this was written for this repo:

- `scripts/dev.sh` runs Convex and Vite together. It fills in missing Google and GitHub keys with `disabled` so Convex can start, and those two buttons fail until you push real keys.
- `scripts/push-secrets.sh` copies the OAuth keys from 1Password into Convex without printing them or writing them to disk.
- `convex/lib/ark.ts` turns arktype types into Convex validators, so tables and arguments are defined once.
- `convex/lib/functions.ts` has function builders that require sign-in and check arguments with arktype.
- `convex/lib/secrets.ts` encrypts pasted secrets, bound to their owner, with versioned keys for rotation.
- `convex/components/cloudflareEmail` is the `@sarant/cloudflare-email` component, changed so each person sends with their own token and no scheduled call ever stores one.
