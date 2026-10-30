import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, type Infer, v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { action, type ActionCtx, internalAction } from "../../_generated/server"
import { boardOf, companyOf, maxText, previewOf } from "../jobs/boards"
import { judge } from "../workflows/actions"
import { urlKey } from "../workflows/fit"
import { limits } from "../workflows/manager"
import { apiKeyOf } from "../workflows/sources"
import { post, record, text } from "../workflows/sources/source"
import type { vPasted } from "../workflows/validators"

// Reads a page that isn't on a job board, once, through Firecrawl (1 credit).
const scrape = async (url: string) => {
  const apiKey = apiKeyOf("firecrawl")
  if (!apiKey)
    throw new ConvexError(
      "Only Greenhouse, Lever, Ashby and Personio links work until a Firecrawl key is set."
    )
  const data = record(
    record(
      await post(
        "https://api.firecrawl.dev/v2/scrape",
        apiKey,
        { url, formats: ["markdown"], onlyMainContent: true },
        (status) => status === 402
      )
    ).data
  )
  const page = text(data.markdown).slice(0, maxText)
  if (!page) throw new ConvexError("That page has no text we could read.")
  const host = new URL(url).hostname.replace(/^(www|jobs|careers)\./, "")
  return {
    title: text(record(data.metadata).title) || "Untitled role",
    company: companyOf(host.split(".")[0] ?? host),
    location: "",
    remote: /remote/i.test(page.slice(0, 1500)),
    text: page,
  }
}

const isLink = (link: string) =>
  link.length <= 2000 && URL.canParse(link) && /^https?:$/.test(new URL(link).protocol)

// Reads a posting and has Jev judge it against the person's Preferences, like a loop
// would. Board links read the free feed; anything else costs one Firecrawl credit.
const readAndJudge = async (
  ctx: ActionCtx,
  userId: Id<"users">,
  link: string,
  key: string
): Promise<{ lead: Infer<typeof vPasted>; credits: number }> => {
  // A board link reads the free feed. Some boards don't publish one, so a role the
  // feed doesn't list is read from its page instead, like any other link.
  const board = boardOf(link)
  let job: Doc<"jobs"> | null = null
  if (board) {
    job = await ctx.runQuery(internal.jobs.byUrlKey, { urlKey: key })
    if (!job) {
      const boardId = await ctx.runMutation(internal.jobs.ensureBoard, board)
      await ctx.runAction(internal.jobs.fetchBoard, { boardId }).catch(() => null)
      job = await ctx.runQuery(internal.jobs.byUrlKey, { urlKey: key })
    }
  }
  const page = job ?? (await scrape(link))
  const profile = await ctx.runQuery(internal.loops.profileForLink, { userId })
  const { cost: _cost, ...verdict } = await judge(profile, page)
  return {
    credits: job ? 0 : 1,
    lead: {
      url: job?.url ?? link,
      urlKey: key,
      title: page.title,
      company: page.company,
      location: page.location,
      snippet: previewOf(page.text, 300),
      ...(job ? { jobId: job._id } : { text: page.text }),
      ...verdict,
    },
  }
}

// Someone pastes a job they found themselves: Jev checks it against their Preferences
// like a loop would, and it opens on their shortlist with the breakdown, fit or not.
// 10 a day, shared with checks of applications added by hand.
const checkLink = action({
  args: { url: v.string() },
  returns: v.id("jobLeads"),
  handler: async (ctx, { url }): Promise<Id<"jobLeads">> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    const link = url.trim()
    if (!isLink(link)) throw new ConvexError("That isn't a link to a job posting.")
    const key = urlKey(link)
    const known = await ctx.runQuery(internal.loops.leadByUrlKey, { userId, urlKey: key })
    if (known) return known
    const { ok } = await limits.limit(ctx, "checkLink", { key: userId })
    if (!ok) throw new ConvexError("You've checked 10 links today. Try again tomorrow.")
    return ctx.runMutation(internal.loops.savePasted, {
      userId,
      ...(await readAndJudge(ctx, userId, link, key)),
    })
  },
})

// An application added by hand with its link: Jev checks the job the same way, links it
// to the application for its Job section, and fills in what was left empty: priority
// from the match, location, a Remote label and a description. It never overwrites.
const enrichApplication = internalAction({
  args: { userId: v.id("users"), applicationId: v.id("applications"), url: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, applicationId, url }) => {
    const link = url.trim()
    if (!isLink(link)) return null
    const key = urlKey(link)
    const known = await ctx.runQuery(internal.loops.leadByUrlKey, { userId, urlKey: key })
    if (known) {
      await ctx.runMutation(internal.loops.attachLead, { leadId: known, applicationId })
      return null
    }
    // shortcut: past the day's 10 checks the application keeps what was typed; a retry
    // button could check it later.
    const { ok } = await limits.limit(ctx, "checkLink", { key: userId })
    if (!ok) return null
    const result = await readAndJudge(ctx, userId, link, key).catch(() => null)
    if (result)
      await ctx.runMutation(internal.loops.savePasted, { userId, ...result, applicationId })
    return null
  },
})

export const linkApi = { checkLink, enrichApplication }
