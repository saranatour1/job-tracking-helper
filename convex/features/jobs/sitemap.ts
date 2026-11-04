import { v } from "convex/values"
import { api, internal } from "../../_generated/api"
import { internalAction, internalMutation, query } from "../../_generated/server"

type Role = { _id: string; title: string; company: string; postedAt: number }

// Reading every role takes over a dozen queries in a row, longer than a crawler waits, so the
// sitemap's roles are written to a file ahead of time.
const buildSitemap = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const roles: Role[] = []
    let cursor: string | null = null
    for (;;) {
      const found: { page: Role[]; isDone: boolean; continueCursor: string } = await ctx.runQuery(
        api.api.jobs.sitemap,
        { cursor }
      )
      roles.push(...found.page)
      if (found.isDone) break
      cursor = found.continueCursor
    }
    const file = await ctx.storage.store(
      new Blob([JSON.stringify(roles)], { type: "application/json" })
    )
    await ctx.runMutation(internal.api.jobs.saveSitemap, { file })
    return null
  },
})

const saveSitemap = internalMutation({
  args: { file: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { file }) => {
    const row = await ctx.db.query("jobCatalog").first()
    if (!row) {
      await ctx.storage.delete(file)
      return null
    }
    if (row.sitemap) await ctx.storage.delete(row.sitemap)
    await ctx.db.patch("jobCatalog", row._id, { sitemap: file })
    return null
  },
})

const sitemapFile = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const row = await ctx.db.query("jobCatalog").first()
    return row?.sitemap ? await ctx.storage.getUrl(row.sitemap) : null
  },
})

export const sitemapApi = { buildSitemap, saveSitemap, sitemapFile }
