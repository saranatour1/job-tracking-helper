import { v } from "convex/values"
import { vGoogleProfile } from "@convex-dev/auth/methods/google/server"
import { vGithubProfile } from "@convex-dev/auth/methods/github/server"

export const vCreateUserArgs = {
  provider: v.union(
    v.object({ name: v.literal("password"), accountId: v.string(), profile: v.object({}) }),
    v.object({ name: v.literal("anonymous"), accountId: v.string(), profile: v.object({}) }),
    v.object({ name: v.literal("google"), accountId: v.string(), profile: vGoogleProfile }),
    v.object({ name: v.literal("github"), accountId: v.string(), profile: vGithubProfile })
  ),
}
