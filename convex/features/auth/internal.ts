import { v } from "convex/values"
import { internalMutation } from "../../_generated/server"
import { vCreateUserArgs } from "./validators"

const createUser = internalMutation({
  args: vCreateUserArgs,
  returns: v.id("users"),
  // Google and GitHub share their name and email; other methods start empty.
  handler: (ctx, { provider }) =>
    ctx.db.insert(
      "users",
      provider.name === "google" || provider.name === "github"
        ? { name: provider.profile.name, email: provider.profile.email }
        : {}
    ),
})

export const internalApi = { createUser }
