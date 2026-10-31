import { v } from "convex/values"
import { vGoogleProfile } from "@convex-dev/auth/methods/google/server"
import { vGithubProfile } from "@convex-dev/auth/methods/github/server"

const vGithubProvider = v.object({
  name: v.literal("github"),
  accountId: v.string(),
  profile: vGithubProfile,
})

export const vCreateUserArgs = {
  provider: v.union(
    v.object({ name: v.literal("password"), accountId: v.string(), profile: v.object({}) }),
    v.object({ name: v.literal("anonymous"), accountId: v.string(), profile: v.object({}) }),
    v.object({ name: v.literal("google"), accountId: v.string(), profile: vGoogleProfile }),
    vGithubProvider
  ),
}

export const vGithubSignInArgs = { provider: vGithubProvider, userId: v.id("users") }
