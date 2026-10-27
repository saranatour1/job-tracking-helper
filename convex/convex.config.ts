import { defineApp } from "convex/server"
import { v } from "convex/values"
import auth from "@convex-dev/auth/convex.config.js"
import authPassword from "@convex-dev/auth/components/password/convex.config.js"
import authUsername from "@convex-dev/auth/components/username/convex.config.js"
import authGoogle from "@convex-dev/auth/components/google/convex.config.js"
import authGithub from "@convex-dev/auth/components/github/convex.config.js"
import authAnonymous from "@convex-dev/auth/components/anonymous/convex.config.js"

const app = defineApp({
  env: {
    SITE_URL: v.string(),
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    AUTH_GOOGLE_CLIENT_ID: v.string(),
    AUTH_GOOGLE_CLIENT_SECRET: v.string(),
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
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

export default app
