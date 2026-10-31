import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { action, internalAction } from "../../_generated/server"
import { urlKey } from "../workflows/fit"
import { limits } from "../workflows/manager"
import { isLink, readAndJudge } from "./read"

const checkLink = action({
  args: { url: v.string() },
  returns: v.id("jobLeads"),
  handler: async (ctx, { url }): Promise<Id<"jobLeads">> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    const link = url.trim()
    if (!isLink(link)) throw new ConvexError("That isn't a link to a job posting.")
    const key = urlKey(link)
    const known = await ctx.runQuery(internal.api.loops.leadByUrlKey, { userId, urlKey: key })
    if (known) return known
    const { ok } = await limits.limit(ctx, "checkLink", { key: userId })
    if (!ok) throw new ConvexError("You've checked 10 links today. Try again tomorrow.")
    return ctx.runMutation(internal.api.loops.savePasted, {
      userId,
      ...(await readAndJudge(ctx, userId, link, key)),
    })
  },
})

const enrichApplication = internalAction({
  args: { userId: v.id("users"), applicationId: v.id("applications"), url: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, applicationId, url }) => {
    const link = url.trim()
    if (!isLink(link)) return null
    const key = urlKey(link)
    const known = await ctx.runQuery(internal.api.loops.leadByUrlKey, { userId, urlKey: key })
    if (known) {
      await ctx.runMutation(internal.api.loops.attachLead, { leadId: known, applicationId })
      return null
    }
    // shortcut: past the day's 10 checks the application keeps what was typed; a retry
    // button could check it later.
    const { ok } = await limits.limit(ctx, "checkLink", { key: userId })
    if (!ok) return null
    const result = await readAndJudge(ctx, userId, link, key).catch(() => null)
    if (result)
      await ctx.runMutation(internal.api.loops.savePasted, { userId, ...result, applicationId })
    return null
  },
})

export const linkApi = { checkLink, enrichApplication }
