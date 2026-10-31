import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { action, type ActionCtx, internalAction } from "../../_generated/server"
import { boardOf } from "../jobs/links"
import { urlKey } from "../workflows/fit"
import { limits } from "../workflows/manager"
import { isLink, judgePasted, pastedPosting, readAndJudge } from "./read"

const check = async (ctx: ActionCtx, userId: Id<"users">, url: string): Promise<Id<"jobLeads">> => {
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
}

const checkLink = action({
  args: { url: v.string() },
  returns: v.id("jobLeads"),
  handler: async (ctx, { url }): Promise<Id<"jobLeads">> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    return check(ctx, userId, url)
  },
})

const checkText = action({
  args: { url: v.string(), text: v.string(), company: v.optional(v.string()) },
  returns: v.id("jobLeads"),
  handler: async (ctx, { url, text, company }): Promise<Id<"jobLeads">> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    const link = url.trim()
    if (!isLink(link)) throw new ConvexError("That isn't a link to a job posting.")
    const page = pastedPosting(link, text, company ?? "")
    const key = urlKey(link)
    const known = await ctx.runQuery(internal.api.loops.leadByUrlKey, { userId, urlKey: key })
    if (known) return known
    const { ok } = await limits.limit(ctx, "checkLink", { key: userId })
    if (!ok) throw new ConvexError("You've checked 10 links today. Try again tomorrow.")
    return ctx.runMutation(internal.api.loops.savePasted, {
      userId,
      ...(await judgePasted(ctx, userId, link, key, page)),
    })
  },
})

const checkLinkFor = internalAction({
  args: { userId: v.id("users"), url: v.string() },
  returns: v.id("jobLeads"),
  handler: async (ctx, { userId, url }): Promise<Id<"jobLeads">> => {
    // A posting can tell an agent to "check" a link with the person's data in it, and fetching
    // that link would deliver the data. So agents only reach companies already in the catalog,
    // which also keeps them from adding a board for everyone, and no query reaches the page.
    const board = boardOf(url.trim())
    if (!board || !(await ctx.runQuery(internal.api.jobs.hasBoard, board)))
      throw new ConvexError(
        "Agents can only check Greenhouse, Lever, Ashby, Personio, SmartRecruiters and Workable links from companies in the catalog. The person can paste other links in the app."
      )
    const link = new URL(url.trim())
    link.search = ""
    link.hash = ""
    return check(ctx, userId, link.toString())
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

export const linkApi = { checkLink, checkText, checkLinkFor, enrichApplication }
