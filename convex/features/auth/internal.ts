import { ConvexError, v } from "convex/values"
import { env, internalMutation } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { maxNameLength, UserName } from "../users/validators"
import { limits } from "../workflows/manager"
import { vCreateUserArgs, vGithubSignInArgs } from "./validators"

const createUser = internalMutation({
  args: vCreateUserArgs,
  returns: v.id("users"),
  handler: async (ctx, { provider }) => {
    // Production takes new accounts only from GitHub until email is set up, and anonymous ones
    // for searching Jobs, which memberId keeps out of everything else.
    if (
      !env.SITE_URL.startsWith("http://localhost") &&
      provider.name !== "github" &&
      provider.name !== "anonymous"
    ) {
      throw new ConvexError("Sign-ups are closed")
    }
    if (provider.name === "anonymous") {
      const { ok } = await limits.limit(ctx, "anonymousAccount")
      if (!ok) throw new ConvexError("Too many new visitors right now. Sign in to keep searching.")
    }
    const userId = await ctx.db.insert(
      "users",
      provider.name === "google"
        ? { name: provider.profile.name, email: provider.profile.email }
        : provider.name === "anonymous"
          ? { anonymous: true }
          : {}
    )
    const log = workLog("account.joined", { userId })
    log.set({ provider: provider.name, outcome: "joined" })
    log.emit()
    return userId
  },
})

// Runs on every GitHub sign-in, right after createUser on the first. It imports once
// and only fills blanks, so what someone edits or clears later stays that way.
const onGithubSignIn = internalMutation({
  args: vGithubSignInArgs,
  returns: v.null(),
  handler: async (ctx, { provider: { profile }, userId }) => {
    const user = await ctx.db.get("users", userId)
    if (!user || user.githubImportedAt) return null
    const { login, name, email, avatarUrl } = profile
    const owner = await ctx.db
      .query("users")
      .withIndex("by_userName", (q) => q.eq("userName", login))
      .first()
    await ctx.db.patch("users", userId, {
      // Profile rejects a longer name, and that would block every later profile save.
      name: user.name || name?.slice(0, maxNameLength),
      email: user.email || email,
      userName: user.userName || (!owner && UserName.allows(login) ? login : undefined),
      github: user.github || login,
      avatarUrl,
      githubImportedAt: Date.now(),
    })
    return null
  },
})

export const internalApi = { createUser, onGithubSignIn }
