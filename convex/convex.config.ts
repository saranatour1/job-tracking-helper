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
import mcp from "@convex-dev/mcp/convex.config.js"
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
    FIRECRAWL_API_KEY: v.optional(v.string()),
    CONTEXT_DEV_API_KEY: v.optional(v.string()),
    FIRECRAWL_MONTHLY_CREDITS: v.optional(v.string()),
    CONTEXT_DEV_MONTHLY_CREDITS: v.optional(v.string()),
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

app.use(workflow)
app.use(workpool, { name: "readPool" })
app.use(workpool, { name: "applyPool" })
app.use(rateLimiter)
app.use(batchWorker)

app.use(aggregate, { name: "automationRunCounts" })
app.use(aggregate, { name: "automationChoices" })

app.use(cloudflareEmail)

app.use(notifications)

app.use(mcp)

export default app
