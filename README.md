# Job Tracking Helper

A job search app. It finds roles that fit what you asked for, fills in their application forms and keeps track of what you sent. It never presses Submit. You do that yourself, in a browser on the page.

## What's in it

- **Preferences and Resume.** Say what you want from your next job, keep the answers forms keep asking for, and check how your resume reads.
- **Jobs and Loops.** A public, searchable daily catalog of open roles from company boards on Greenhouse, Lever, Ashby, Personio, SmartRecruiters and Workable, plus Remote OK, Hacker News and, for German places, the Arbeitsagentur. Morning searches have Jev judge roles against your Preferences and put a few fits on your shortlist. For LinkedIn, Xing, Experteer or X, which the app doesn't read, you paste the text.
- **Prefilled applications.** On Greenhouse, Lever, Ashby and Personio, the app reads a posting's form, matches your saved answers and drafts the job-specific questions. The real form then opens beside your answers for you to check and submit.
- **Applications, Views and Goals.** A board or list by status, with one timeline per application, saved views, and milestones.
- **Mail and Contacts.** Connect your own Cloudflare account to send from your domain and receive replies. Each company can have its own address, so mail lands on the right application.
- **Calendar and Booking pages.** Application dates, interviews read from email and your own events, plus links a recruiter can book from.
- **Workflows and Activity.** A trigger and up to 20 steps built on a canvas, and a record of everything the app did for you and why anything failed.
- **Connected agents.** An MCP server, so Claude, ChatGPT, Cursor or Claude Code can do much of this for you, plus the public documents agents use to find it. Agents draft and you submit.

Anyone can browse Jobs and open a posting, which has its own page and link preview image. Searching without an account makes an anonymous one, limited to 10 searches a day and to Jobs.

[docs/flows.md](docs/flows.md) covers every flow, and [docs/workflows.md](docs/workflows.md) covers workflows.

## What happens to your data

Your resume file only gets attached to applications until you press Review on the Resume page. Review sends its text to Jev. After that, AI drafts use the text with your email and phone removed by pattern, in requests that ask the provider to keep no data.

Demographic questions are skipped by their wording, and job-site passwords are never stored. Pasted tokens, connection details, mail, contacts and drafts are encrypted with AES-256-GCM, under a key only the server holds. Resumes, saved answers and applications don't get that extra layer.

The site sends page views, web vitals, outgoing link clicks and session replays to Databuddy, except on booking pages. Replays mask text. On Jobs it also sends the words searched for and which roles get opened. [src/server.ts](src/server.ts) also reports AI crawler and agent requests to Databuddy from the server. [/privacy](src/routes/privacy.tsx) lists all of this, and it has to stay true when any of it changes.

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

Username and password sign-in and guest sign-in now work. Email, AI, Firecrawl, OAuth and deploying all need more setup, covered in [docs/development.md](docs/development.md).

Run the checks with:

```bash
vp check
vp run typecheck
vp test
```

## Folder structure

```
convex/
  api/<feature>.ts      registers each feature's functions, since a file's path is its API name
  features/<feature>/   a feature's tables, validators and functions
  components/           local components: cloudflareEmail and notifications
  lib/                  arktype to Convex, signed-in function builders, secrets, logging, request signing
src/
  routes/               pages. /, /jobs, /jobs/$id, /privacy, /terms and /book/$slug are public
  server.ts             the Worker's entry: reports AI crawlers, serves agent discovery and posting images
  features/<feature>/   a feature's components. Applications, Views and Goals are in tracker/
  components/ui/        shadcn and coss components, managed by the shadcn CLI
  components/kloq/      the kloq calendar as source, from its registry
  hooks/, lib/          shared hooks and helpers, like the api import, route text, SEO and agent discovery
  assets/               the link preview image, built with a hash in its name
public/                 logos, icons, robots.txt, sitemap.xml and llms.txt
scripts/                dev and secrets scripts
docs/
  development.md        env vars, deploying, code rules
  flows.md              every user and agent flow, per feature
  workflows.md          workflows in depth
  database-design.md    the tables, what deleting does, and how to change what's stored
.claude/, .agents/      agent skills: running and checking the app, PRs, Convex and arktype
```

## Tools

| Area          | Used                                                                  |
| ------------- | --------------------------------------------------------------------- |
| Toolchain     | Vite+ (`vp`) for the dev server, build, lint and format               |
| Frontend      | React 19, TanStack Start, Router, Table and Form, Tiptap              |
| UI            | Tailwind CSS v4, shadcn CLI with coss ui, Hugeicons, kloq, React Flow |
| Backend       | Convex, Convex Auth v2, convex-helpers, batch worker for big deletes  |
| Agents        | `@convex-dev/mcp`                                                     |
| AI            | Jev and Claude Haiku, through the Convex AI gateway and the AI SDK    |
| Forms and web | Firecrawl, RDAP, the community YC list                                |
| Validation    | arktype                                                               |
| Type checking | tsrs                                                                  |
| Convex lint   | `@convex-dev/eslint-plugin`, loaded by oxlint                         |
| Secrets       | 1Password CLI (`op`)                                                  |
| Hosting       | Cloudflare Workers, through `@cloudflare/vite-plugin`                 |
| Link previews | `@cf-wasm/og`, with Figtree from `@fontsource/figtree`                |
| Analytics     | Databuddy                                                             |

Written for this repo:

- `scripts/dev.sh` runs Convex and Vite together. It fills in missing Google and GitHub keys with `disabled` so Convex can start, and those two buttons fail until you push real keys.
- `scripts/push-secrets.sh` copies the OAuth keys from 1Password into Convex without printing them or writing them to disk.
- `convex/lib/ark.ts` turns arktype types into Convex validators, so tables and arguments are defined once.
- `convex/lib/functions.ts` has function builders that require sign-in and check arguments with arktype.
- `convex/lib/secrets.ts` encrypts pasted secrets, bound to their owner, with versioned keys for rotation.
- `convex/components/cloudflareEmail` is the `@sarant/cloudflare-email` component, changed so each person sends with their own token and no scheduled call ever stores one.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security bugs through [SECURITY.md](SECURITY.md).

## License

[PolyForm Noncommercial License 1.0.0](LICENSE). It's free for noncommercial use, and commercial use needs the owner's permission. `src/components/kloq` is MIT, under [its own license](src/components/kloq/LICENSE).
