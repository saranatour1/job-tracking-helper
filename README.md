# Job Tracking Helper

Track job applications: company, role and status, saved per user.

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

Username/password and guest sign-in work right away. Google and GitHub sign-in show up once their keys are in Convex:

1. In 1Password, add an item `job-tracking-helper` to your Private vault, with fields `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, `AUTH_GITHUB_CLIENT_ID` and `AUTH_GITHUB_CLIENT_SECRET`.
2. Run `vp run secrets:push`. Set `OP_VAULT` to use another vault.

Checks:

```bash
vp check
vp run typecheck
sh scripts/push-secrets.test.sh
```

## Folder structure

```
convex/
  auth.ts, users.ts, applications.ts   public API: only these files register functions
  features/<feature>/                  function definitions, re-exported by the files above
  lib/functions.ts                     authedQuery, authedMutation, arkMutation
  schema.ts                            tables
src/
  routes/                              pages (TanStack Router); they only import a feature
  features/<feature>/                  a component plus a use-* hook holding its logic
  components/ui/                       shadcn/coss components, managed by the shadcn CLI
scripts/                               dev and secrets scripts
.claude/skills/verify-job-tracking-helper/   how an agent launches, drives and checks the app
```

Code rules, enforced by `vp check`: arrow functions only, no `useEffect`. Files the shadcn CLI manages are exempt.

## Tools

| Area          | Used                                                            |
| ------------- | --------------------------------------------------------------- |
| Toolchain     | Vite+ (`vp`): dev server, build, lint, format                   |
| Frontend      | React 19, TanStack Start, Router, Table and Form                |
| UI            | Tailwind CSS v4, shadcn CLI with coss ui (Base UI), Hugeicons   |
| Backend       | Convex, Convex Auth v2, convex-helpers                          |
| Validation    | arktype, shared by the form and the `applications:add` mutation |
| Type checking | tsrs                                                            |
| Secrets       | 1Password CLI (`op`)                                            |

Made for this repo:

- `scripts/dev.sh` runs Convex and Vite together. It fills in missing Google and GitHub keys with `disabled`, so dev works without them.
- `scripts/push-secrets.sh` copies the OAuth keys from 1Password into Convex without printing them or writing them to disk.
- `convex/lib/functions.ts` has function builders that require sign-in and check arguments with arktype.
- `.claude/skills/verify-job-tracking-helper` is an agent skill with a health check, an evidence helper and step-by-step checks for each feature.
