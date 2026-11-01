# Packages

Every direct dependency in `package.json`, 44 runtime and 15 dev, and why it's here. Update this when `package.json` changes.

## Framework and backend

| Package                  | Why                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react`                  | The UI. 179 files import it.                                                                                                                        |
| `react-dom`              | Required by Base UI, TanStack, Tiptap and React Flow. The page header also uses its `createPortal`.                                                 |
| `@tanstack/react-start`  | Server rendering and the Worker entry in `src/server.ts`.                                                                                           |
| `@tanstack/react-router` | File routes under `src/routes`, and search params that hold page state in place of `useState`.                                                      |
| `@tanstack/react-form`   | Form state for Preferences, Loops, Account and others, so those pages don't need `useState`.                                                        |
| `convex`                 | Database, server functions and live queries. The whole backend runs on it.                                                                          |
| `convex-helpers`         | Cached query hooks that keep a page's data when you come back, which lint requires. Also the signed-in function builders and the merged job stream. |
| `arktype`                | Defines rules like trimming and lengths once, then `convex/lib/ark.ts` turns them into Convex validators.                                           |

## Convex components

| Package                    | Why                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@convex-dev/auth`         | Username and password, guest, Google and GitHub sign-in. Its `auth` command also sets the keys.                                      |
| `@convex-dev/workflow`     | Runs people's workflows as durable steps through `WorkflowManager`.                                                                  |
| `@convex-dev/workpool`     | Two queues with different rules. `readPool` runs 8 at once with 3 tries. `applyPool` runs 2 at once and never retries.               |
| `@convex-dev/batch-worker` | Big deletes and judged-job cleanup, which won't fit in one mutation.                                                                 |
| `@convex-dev/aggregate`    | Counts workflow runs and choices without reading every row.                                                                          |
| `@convex-dev/rate-limiter` | Limits in `workflows/manager.ts` and `email/utils.ts`, like 120 agent reads a minute, sharded so parallel agent calls don't collide. |
| `@convex-dev/mcp`          | The MCP server in `convex/mcp.ts` that connected agents use.                                                                         |

## AI, mail, documents

| Package                       | Why                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ai`                          | `experimental_decide` asks Jev typed questions. `generateText` writes application drafts.                                 |
| `@convex-dev/ai-sdk-provider` | Points the AI SDK at the Convex AI gateway.                                                                               |
| `postal-mime`                 | Parses raw received mail into sender, subject and body in `email/parse.ts`.                                               |
| `unpdf`                       | Pulls resume text on the server. It works inside Convex, where the app has no browser.                                    |
| `pdfjs-dist`                  | Draws the resume PDF in the browser, beside its review. `unpdf` only covers the text.                                     |
| `rehype`                      | Parses HTML postings on the server. The code comment says remark's entity decoder needs a DOM, which Convex doesn't have. |
| `rehype-sanitize`             | Strips scripts, event handlers and tracking images from postings, on the server and again when drawn.                     |
| `react-markdown`              | Draws stored postings.                                                                                                    |
| `remark-gfm`                  | Adds GitHub Markdown, like tables and task lists, to `react-markdown`.                                                    |
| `@tiptap/react`               | The rich text mail editor in `mail/editor.tsx`.                                                                           |
| `@tiptap/starter-kit`         | The editor's headings, lists, bold and so on.                                                                             |
| `@tiptap/pm`                  | ProseMirror, which `@tiptap/react` requires as a peer. Nothing imports it directly.                                       |

## UI and styling

| Package                            | Why                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@base-ui/react`                   | Unstyled, accessible parts under coss ui and kloq. It replaced Radix in #13.                                        |
| `shadcn`                           | The CLI that manages `components/ui`. It's a runtime dependency because `styles.css` imports `shadcn/tailwind.css`. |
| `@xyflow/react`                    | The workflow builder canvas.                                                                                        |
| `class-variance-authority`         | Component variants in `components/ui` and kloq.                                                                     |
| `cn`                               | Merges Tailwind classes everywhere outside kloq, through `src/lib/utils.ts`.                                        |
| `clsx`                             | Used only by kloq's own `cn`. kloq ships as registry source, so it stays as it comes.                               |
| `tailwind-merge`                   | Same as `clsx`, only kloq.                                                                                          |
| `tw-animate-css`                   | Enter animations like `fade-in`, used in 4 files across Landing, Preferences and Tracker.                           |
| `@hugeicons/react`                 | The app's icon component, set as the icon library in `components.json`.                                             |
| `@hugeicons/core-free-icons`       | The icons drawn by `@hugeicons/react`, in 28 feature files.                                                         |
| `lucide-react`                     | Icons in 27 kloq files and 8 coss ui files, which ship with it.                                                     |
| `@fontsource-variable/public-sans` | Self-hosted Public Sans, imported in `styles.css`.                                                                  |
| `@fontsource-variable/figtree`     | Self-hosted Figtree for the browser.                                                                                |
| `@fontsource/figtree`              | Static `.woff` weights that `jobs/og.tsx` inlines for link preview images.                                          |

## Operations

| Package          | Why                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `@cf-wasm/og`    | Draws each posting's link preview image inside the Worker.                                          |
| `@databuddy/sdk` | Page analytics in `__root.tsx`, search events on Jobs, and AI crawler reports from `src/server.ts`. |
| `evlog`          | Structured logs for background work, with emails, bearer tokens and JWTs redacted.                  |

## Dev tools

| Package                     | Why                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `vite-plus`                 | `vp` runs dev, build, lint, format and tests. 65 test files import `vite-plus/test`.                            |
| `vite`                      | Aliased to `@voidzero-dev/vite-plus-core`, so plugins that look for Vite get the Vite+ build.                   |
| `@vitejs/plugin-react`      | JSX and fast refresh in dev.                                                                                    |
| `tailwindcss`               | The styles, imported at the top of `styles.css`.                                                                |
| `@tailwindcss/vite`         | Runs Tailwind v4 in the Vite build.                                                                             |
| `@cloudflare/vite-plugin`   | Builds for Workers. It only loads during `build`, since local dev stays on Node.                                |
| `wrangler`                  | `wrangler deploy`, and a peer of the Cloudflare plugin.                                                         |
| `tsrs`                      | Runs `vp run typecheck`. It's the Rust port of the TypeScript 7 compiler.                                       |
| `typescript`                | With no `convex.json`, the Convex CLI type-checks functions with `tsc`, even though our own script uses `tsrs`. |
| `convex-test`               | Runs Convex functions in `*.convex.test.ts` without a deployment.                                               |
| `@edge-runtime/vm`          | Backs the `// @vitest-environment edge-runtime` line those tests start with. Nothing imports it directly.       |
| `@convex-dev/eslint-plugin` | Convex rules, like required argument validators, loaded by oxlint.                                              |
| `@types/node`               | Node types.                                                                                                     |
| `@types/react`              | React types.                                                                                                    |
| `@types/react-dom`          | React DOM types.                                                                                                |
