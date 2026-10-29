# Job Tracking Helper

Track job applications: company, role and status, saved per user.

New accounts start on Preferences, which asks what someone wants from their next job in their own words, one section at a time, and saves it to Convex. Its Overview tab lists every answer, and clicking one opens its section. Its Prefilled tab keeps the fields application forms ask for, in sections you can add, rename and remove, suggested from those words and ready to copy. A copy-paste prompt lets them fill it with their own AI assistant. A resume upload is optional, kept only to attach to applications, and never read.

Jobs lists every open role in a shared catalog, built from the free feeds of company job boards (Greenhouse, Lever, Ashby, Personio) and refreshed daily. Search it, keep to remote roles, switch to a compact list, or find more like any role.

Loops pick roles from that catalog each morning, for every kind of role you describe in each of your places. Jev judges each one against your Preferences through the Convex AI gateway and says what fits, what could and what doesn't. Only a few fits at a time reach your shortlist; save, favorite, dismiss or add each to your tracker, and tomorrow's runs learn from it. Paste any job's link to have it checked the same way. Jev needs no key, but the gateway needs a paid Convex Cloud plan. To find new boards, a run searches Firecrawl or context.dev when `FIRECRAWL_API_KEY` or `CONTEXT_DEV_API_KEY` is in the Convex env (`pnpm exec convex env set FIRECRAWL_API_KEY ...`); without one, runs judge roles from the boards already known.

Account connects your own Cloudflare account, so emails can go out from your domain. Paste an account ID and an API token: the token is checked with Cloudflare, encrypted with AES-256-GCM under a key only the server holds, and never shown again, only its last 4 characters. Replacing it checks the new one before the old one goes. A test email shows it works. Incoming mail, matched to applications, comes next.

The Inbox, Pipeline, Goals and Views pages are a preview built on sample data from `src/features/tracker/data.ts`. They don't read from or save to Convex yet. Edits there last until you reload, and the create buttons do nothing.

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
  lib/                                 shared helpers: arktype to Convex, signed-in builders, secrets
  schema.ts                            collects each feature's tables
src/
  routes/                              pages (TanStack Router); they only import a feature
    _app.tsx, _auth.tsx                layouts: signed-in pages, and /sign-in + /sign-up
  features/<feature>/                  the feature's components
  features/tracker/                    Inbox, Pipeline, Goals and Views, on sample data for now
  features/preferences/                Preferences: the form, the assistant prompt and the profile blocks
  features/jobs/                       Jobs: the shared catalog of open roles
  features/loops/                      Loops: morning job searches, their runs and sources
  features/account/                    Account: profile, email connection, theme, sign-out
  components/ui/                       shadcn/coss components, managed by the shadcn CLI
scripts/                               dev and secrets scripts
docs/database-design.md                planned tables, status flow and build order
.claude/skills/verify-job-tracking-helper/   how an agent launches, drives and checks the app
.claude/skills/write-pr/             how an agent writes commits and PRs
```

Code rules, enforced by `vp check`: arrow functions only, no `useEffect`. Files the shadcn CLI manages are exempt. Frontend imports use `@/` for `src/` and `@convex/` for `convex/`.

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
