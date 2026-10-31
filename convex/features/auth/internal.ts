import { ConvexError, v } from "convex/values"
import { env, internalMutation } from "../../_generated/server"
import { workLog } from "../../lib/log"
import { vCreateUserArgs } from "./validators"

const createUser = internalMutation({
  args: vCreateUserArgs,
  returns: v.id("users"),
  handler: async (ctx, { provider }) => {
    // Production takes new accounts only from GitHub until email is set up.
    if (!env.SITE_URL.startsWith("http://localhost") && provider.name !== "github") {
      throw new ConvexError("Sign-ups are closed")
    }
    const userId = await ctx.db.insert(
      "users",
      provider.name === "google" || provider.name === "github"
        ? { name: provider.profile.name, email: provider.profile.email }
        : {}
    )
    const log = workLog("account.joined", { userId })
    log.set({ provider: provider.name, outcome: "joined" })
    log.emit()
    return userId
  },
})

export const internalApi = { createUser }
