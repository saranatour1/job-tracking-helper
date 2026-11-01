# Development

What you need past the first run in the [README](../README.md#how-to-run): environment variables, deploying, and the code rules.

## Environment variables

These all live in the Convex env, declared in `convex/convex.config.ts`.

| Variable                                                   | Needed for                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SITE_URL`                                                 | Required. Sign-in only redirects here, and agents are sent to `/connect` on it                 |
| `AUTH_PRIVATE_KEY`, `AUTH_JWKS`                            | Required. `pnpm exec auth` generates them                                                      |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`       | Required by Convex. On dev, `scripts/dev.sh` sets any that are missing to `disabled`           |
| `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`       | Required by Convex, the same way. Production needs real ones, since GitHub is its only sign-in |
| `SECRETS_KEYS`                                             | Email. Without it, email features say so                                                       |
| `FIRECRAWL_API_KEY`                                        | Prefilled applications, reading pasted links, and finding new boards                           |
| `CONTEXT_DEV_API_KEY`                                      | Another way for loops to find new boards                                                       |
| `FIRECRAWL_MONTHLY_CREDITS`, `CONTEXT_DEV_MONTHLY_CREDITS` | Your plan's credits, if they differ from the free plans' 500 and 1,000                         |
| `WEB_BOT_AUTH_KEY`                                         | Signing job feed requests. Without it they go unsigned and the key directory is empty          |

### Email

```bash
pnpm exec convex env set SECRETS_KEYS "v1:$(openssl rand -base64 32)"
```

To rotate it, append a new key (`v1:...,v2:...`), run `pnpm exec convex run api/email:resealAll`, then remove the old one.

### AI

Jev and the drafts go through the Convex AI gateway. It needs no key, but it does need a paid Convex Cloud plan.

### Finding boards

With neither `FIRECRAWL_API_KEY` nor `CONTEXT_DEV_API_KEY`, loops only judge roles from boards they already know.

### Google and GitHub sign-in

Add an item called `job-tracking-helper` to your Private vault in 1Password, with fields `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, `AUTH_GITHUB_CLIENT_ID` and `AUTH_GITHUB_CLIENT_SECRET`. Then run `vp run secrets:push`. Set `OP_VAULT` to use another vault.

Dev shows both buttons. Production only shows GitHub.

### Agent discovery

`src/lib/discovery.ts` serves what agents read, like `/auth.md` and the `/.well-known/` documents, with no setup. Two parts live outside the code.

**Web Bot Auth.** Generate the signing key once per deployment. The public half is published from it, so this is all it takes:

```bash
pnpm exec convex env set --prod WEB_BOT_AUTH_KEY "$(node -e 'console.log(JSON.stringify(require("crypto").generateKeyPairSync("ed25519").privateKey.export({format:"jwk"})))')"
```

To rotate it, run the same command. Sites that cached the old key can take up to an hour to see the new one.

**DNS for AI Discovery.** Add this record in the Cloudflare DNS settings for `saranatour.dev`, then turn on DNSSEC for the zone. The target is the production MCP server's host, so it changes only if the Convex deployment does.

```dns
_index._agents.ye.saranatour.dev. 3600 IN SVCB 1 acrobatic-tiger-342.eu-west-1.convex.site. alpn="mcp" port=443 mandatory=alpn,port
```

Check all of it after a deploy. `isitagentready.com` lists any check that fails:

```bash
curl -s -X POST https://isitagentready.com/api/scan -H 'Content-Type: application/json' -d '{"url":"https://ye.saranatour.dev"}'
```

## Deploy

The site runs on Cloudflare Workers. In the Cloudflare project, set the build command to `pnpm convex deploy --cmd "vp build"`, which builds the site and ships the backend, and the deploy command to `npx wrangler deploy`. The Worker name in `wrangler.jsonc` must match the project.

The build command needs a production deploy key from the Convex dashboard. Add it in the Cloudflare project's build settings as a secret named `CONVEX_DEPLOY_KEY`. Turn off builds for other branches, since they would deploy their backend to production too.

`vp run deploy` does the same from your machine.

## Other checks

`sh scripts/push-secrets.test.sh` tests the secrets script. `vp check` and `vp test` don't run it.

## Code rules

### What `vp check` enforces

- No function declarations. Use arrow functions.
- No `useEffect` or `useLayoutEffect`.
- No `useState` in preferences, loops, jobs, account, inbox or calendar. Those pages keep state in forms, the URL, `useActionState` or refs, and new code elsewhere should too.

`src/components/kloq` is skipped entirely. `src/components/ui` and `src/hooks/use-media-query.ts` skip the first two rules.

Frontend imports use `@/` for `src/` and `@convex/` for `convex/`.

### Feature folders

A backend feature usually has these files, and smaller ones have fewer:

```
convex/features/<feature>/
  models.ts       the feature's tables, or a models/ folder when there are several
  validators.ts   shapes, rules and limits, safe to import from the frontend
  public.ts       functions the frontend calls
  internal.ts     functions only the backend calls
  utils.ts        what those functions share
  index.ts        collects public and internal into one object
```

The frontend imports `api` from `src/lib/api.ts`, not the generated one.

### Routes

Routes use regular text, not table ids: `/pipeline/app-4`, `/prefilled/engineer-figma`, `/email?open=oct-31-3-10-pm`. `src/lib/route-ids.ts` turns ids into text and back. Email, drafts, runs and Updates use their date, so a private subject never reaches a URL.

A route is hidden from search unless it uses `publicHead` from `src/lib/seo.ts`.

### Reads and deletes

Lists you scroll through read with `.paginate` and `usePaginatedQuery`, not a big `.take` or `.collect`. A read that needs every row to be right, like the board's columns, keeps a limit, listed in [database-design.md](database-design.md#how-much-each-read-takes).

Anything that can delete many rows goes through `startDelete` (`convex/features/deletes/`), which uses the batch worker.

### Function speed

Convex loads a function's whole file and its imports on every run that isn't cached, so imports decide how fast it is. Feature function files don't import `schema`: `docOf` builds a return validator from one table (`convex/lib/docs.ts`). Keep heavy packages, like the AI SDK, out of the helpers that plain reads share, and put actions that need them in their own `convex/api` file, as the `*Actions` files there do.

### Validation

Arguments use arktype when text has rules Convex can't check, like trimming or lengths. Ids, booleans and fixed choices use `v`.

### Tests

Tests that run Convex functions are named `*.convex.test.ts` and use `convex-test`.
