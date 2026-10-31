import { defineApp } from "convex/server"
import { v } from "convex/values"
import auth from "@convex-dev/auth/convex.config.js"
import authPassword from "@convex-dev/auth/components/password/convex.config.js"
import authUsername from "@convex-dev/auth/components/username/convex.config.js"
import authGoogle from "@convex-dev/auth/components/google/convex.config.js"
import authGithub from "@convex-dev/auth/components/github/convex.config.js"
import authAnonymous from "@convex-dev/auth/components/anonymous/convex.config.js"
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js"
import workflow from "@convex-dev/workflow/convex.config.js"
import aggregate from "@convex-dev/aggregate/convex.config.js"
import workpool from "@convex-dev/workpool/convex.config.js"
import batchWorker from "@convex-dev/batch-worker/convex.config.js"
import cloudflareEmail from "./components/cloudflareEmail/convex.config"
import notifications from "./components/notifications/convex.config"

const app = defineApp({
  env: {
    SITE_URL: v.string(),
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    AUTH_GOOGLE_CLIENT_ID: v.string(),
    AUTH_GOOGLE_CLIENT_SECRET: v.string(),
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
    // Loops' job sources. A source without a key is skipped; the credits are each
    // plan's monthly allowance, defaulting to the free plans.
    FIRECRAWL_API_KEY: v.optional(v.string()),
    CONTEXT_DEV_API_KEY: v.optional(v.string()),
    FIRECRAWL_MONTHLY_CREDITS: v.optional(v.string()),
    CONTEXT_DEV_MONTHLY_CREDITS: v.optional(v.string()),
    // Encrypts the API tokens people paste in (see lib/secrets): "v1:<base64 32 bytes>",
    // with newer keys appended for rotation.
    SECRETS_KEYS: v.optional(v.string()),
  },
})

app.use(auth, {
  httpPrefix: "/auth",
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
})
app.use(authPassword)
app.use(authUsername)
app.use(authAnonymous)
app.use(authGoogle, {
  httpPrefix: "/oauth/google",
  env: {
    CLIENT_ID: app.env.AUTH_GOOGLE_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GOOGLE_CLIENT_SECRET,
  },
})
app.use(authGithub, {
  httpPrefix: "/oauth/github",
  env: {
    CLIENT_ID: app.env.AUTH_GITHUB_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GITHUB_CLIENT_SECRET,
  },
})

// Loops: the workflow component runs each morning's search step by step, `readPool`
// (the batch worker) fetches job boards and runs Jev's judgments under one shared
// limit, and the rate limiter keeps calls to each source under its per-minute limit.
// Jev is called through the Convex AI gateway, so it needs no key here.
app.use(workflow)
app.use(workpool, { name: "readPool" })
// Auto-apply runs: a few at a time, and never retried, so a form is never submitted twice.
app.use(workpool, { name: "applyPool" })
app.use(rateLimiter)
// Big deletes, in batches, by one loop (features/deletes).
app.use(batchWorker)

// Counters: each workflow's runs bucketed by how they ended (see automations/counts).
app.use(aggregate, { name: "automationRunCounts" })
// Buckets for Ask Jev's answers: how often each was given, per step.
app.use(aggregate, { name: "automationChoices" })

// Email: each person sends from their own Cloudflare account, with their token
// sealed in emailConnections. The component keeps the emails themselves.
app.use(cloudflareEmail)

// The inbox: a notification feed per person, and the kinds they muted.
app.use(notifications)

export default app
