# Job Tracking Helper

Track job applications: company, role and status, saved per user.

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

Username/password and guest sign-in work right away. The Google and GitHub buttons work once their keys are in Convex:

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
  lib/                                 shared helpers: arktype to Convex, signed-in builders
  schema.ts                            collects each feature's tables
src/
  routes/                              pages (TanStack Router); they only import a feature
    _app.tsx, _auth.tsx                layouts: signed-in pages, and /sign-in + /sign-up
  features/<feature>/                  the feature's components
  features/tracker/                    Inbox, Pipeline, Goals and Views, on sample data for now
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
| Validation    | arktype, shared by the form and the `applications:add` mutation |
| Type checking | tsrs                                                            |
| Convex lint   | `@convex-dev/eslint-plugin` recommended rules, loaded by oxlint |
| Secrets       | 1Password CLI (`op`)                                            |

Made for this repo:

- `scripts/dev.sh` runs Convex and Vite together. It fills in missing Google and GitHub keys with `disabled`, so Convex starts without them. Those two buttons fail until real keys are pushed.
- `scripts/push-secrets.sh` copies the OAuth keys from 1Password into Convex without printing them or writing them to disk.
- `convex/lib/functions.ts` has function builders that require sign-in and check arguments with arktype.
- `convex/lib/ark.ts` turns arktype types into Convex validators (`arkToConvex`, `arkOutputToConvex`, `arkId`), so tables and args are defined once in arktype.
- `.claude/skills/verify-job-tracking-helper` is an agent skill with a health check, an evidence helper and step-by-step checks for each feature.
- `.claude/skills/write-pr` is an agent skill for Conventional Commits titles and short PR bodies, matching `.github/pull_request_template.md`. Its script uploads screenshots to the `pr-assets` branch.
