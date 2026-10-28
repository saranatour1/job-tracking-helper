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
import workpool from "@convex-dev/workpool/convex.config.js"

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
// reads postings for every run under one shared limit, and the rate limiter keeps calls
// to each source under its per-minute limit.
app.use(workflow)
app.use(workpool, { name: "readPool" })
app.use(rateLimiter)

export default app
