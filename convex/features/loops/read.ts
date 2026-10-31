import { ConvexError, type Infer } from "convex/values"
import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { ActionCtx } from "../../_generated/server"
import { companyOf, maxText } from "../jobs/boards"
import { boardOf, previewOf } from "../jobs/links"
import { apiKeyOf } from "../workflows/sources"
import { post, record, text } from "../workflows/sources/source"
import { judge } from "../workflows/utils"
import type { vPasted } from "../workflows/validators"

export const scrape = async (url: string) => {
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

export const isLink = (link: string) =>
  link.length <= 2000 && URL.canParse(link) && /^https?:$/.test(new URL(link).protocol)

export const readAndJudge = async (
  ctx: ActionCtx,
  userId: Id<"users">,
  link: string,
  key: string
): Promise<{ lead: Infer<typeof vPasted>; credits: number }> => {
  // Even off a board: a company's own careers link can name a posting already in the catalog.
  let job: Doc<"jobs"> | null = await ctx.runQuery(internal.api.jobs.byUrlKey, { urlKey: key })
  const board = boardOf(link)
  if (!job && board) {
    const boardId = await ctx.runMutation(internal.api.jobs.ensureBoard, board)
    await ctx.runAction(internal.api.jobs.fetchBoard, { boardId }).catch(() => null)
    job = await ctx.runQuery(internal.api.jobs.byUrlKey, { urlKey: key })
  }
  const page = job ?? (await scrape(link))
  const profile = await ctx.runQuery(internal.api.loops.profileForLink, { userId })
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
