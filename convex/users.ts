import { vGithubProfile } from "@convex-dev/auth/methods/github/server"
import { vGoogleProfile } from "@convex-dev/auth/methods/google/server"
import { v } from "convex/values"
import { internalMutation } from "./_generated/server"

export const createUser = internalMutation({
  args: {
    provider: v.union(
      v.object({ name: v.literal("password"), accountId: v.string(), profile: v.object({}) }),
      v.object({ name: v.literal("anonymous"), accountId: v.string(), profile: v.object({}) }),
      v.object({ name: v.literal("google"), accountId: v.string(), profile: vGoogleProfile }),
      v.object({ name: v.literal("github"), accountId: v.string(), profile: vGithubProfile })
    ),
  },
  returns: v.id("users"),
  handler: (ctx) => ctx.db.insert("users", {}),
})
