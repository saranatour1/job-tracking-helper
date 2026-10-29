import { ConvexError, v } from "convex/values"
import type { Doc, Id } from "../../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../../_generated/server"
import { authedMutation, authedQuery } from "../../../lib/functions"
import schema from "../../../schema"

// Archived applications leave the board but stay; after `archiveDays` they move to the
// Trash. The Trash keeps them out of everything, and after the person's `trashDays` they're
// deleted for good. A daily sweep does both.

const day = 24 * 60 * 60 * 1000
export const archiveDays = 30
export const defaultTrashDays = 90
export const trashDayChoices = [0, 30, 90, 180, 365] as const

const own = async (ctx: MutationCtx, userId: Id<"users">, id: Id<"applications">) => {
  const application = await ctx.db.get("applications", id)
  if (application?.userId !== userId) throw new ConvexError("That application isn't yours.")
  return application
}

/** Deletes an application for good, and unlinks what pointed at it: its mail stays as
 * unfiled, events stay on the calendar, and a job lead stays tracked so loops never
 * offer the role again. */
export const deleteApplication = async (ctx: MutationCtx, application: Doc<"applications">) => {
  for (const mail of await ctx.db
    .query("mailEvents")
    .withIndex("by_userId_and_applicationId", (q) =>
      q.eq("userId", application.userId).eq("applicationId", application._id)
    )
    .take(500))
    await ctx.db.patch("mailEvents", mail._id, { applicationId: undefined, suggest: undefined })
  for (const lead of await ctx.db
    .query("jobLeads")
    .withIndex("by_applicationId", (q) => q.eq("applicationId", application._id))
    .take(50))
    await ctx.db.patch("jobLeads", lead._id, { applicationId: undefined })
  for (const event of await ctx.db
    .query("calendarEvents")
    .withIndex("by_userId_and_key", (q) => q.eq("userId", application.userId))
    .take(1000))
    if (event.applicationId === application._id)
      await ctx.db.patch("calendarEvents", event._id, { applicationId: undefined })
  await ctx.db.delete("applications", application._id)
}

/** What's in the Trash, newest first. */
const trashed = authedQuery({
  args: {},
  returns: v.array(schema.doc("applications")),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("applications")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .collect()
    )
      .filter((a) => a.trashedAt !== undefined)
      .sort((a, b) => b.trashedAt! - a.trashedAt!),
})

const archive = authedMutation({
  args: { id: v.id("applications"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { id, archived }) => {
    await own(ctx, ctx.userId, id)
    await ctx.db.patch("applications", id, { archivedAt: archived ? Date.now() : undefined })
    return null
  },
})

const trash = authedMutation({
  args: { id: v.id("applications") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await own(ctx, ctx.userId, id)
    await ctx.db.patch("applications", id, { trashedAt: Date.now() })
    return null
  },
})

/** Back on the board, out of the Archive too. */
const restore = authedMutation({
  args: { id: v.id("applications") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await own(ctx, ctx.userId, id)
    await ctx.db.patch("applications", id, { trashedAt: undefined, archivedAt: undefined })
    return null
  },
})

/** Deletes one application from the Trash now. */
const deleteForever = authedMutation({
  args: { id: v.id("applications") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const application = await own(ctx, ctx.userId, id)
    if (application.trashedAt === undefined)
      throw new ConvexError("Move it to the Trash before deleting it.")
    await deleteApplication(ctx, application)
    return null
  },
})

/** Deletes everything in the Trash now, a batch at a time. Returns how many. */
const emptyTrash = authedMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const all = await ctx.db
      .query("applications")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect()
    const gone = all.filter((a) => a.trashedAt !== undefined).slice(0, 100)
    for (const application of gone) await deleteApplication(ctx, application)
    return gone.length
  },
})

const setTrashDays = authedMutation({
  args: { days: v.number() },
  returns: v.null(),
  handler: async (ctx, { days }) => {
    if (!(trashDayChoices as readonly number[]).includes(days))
      throw new ConvexError("Pick one of the choices.")
    await ctx.db.patch("users", ctx.userId, { trashDays: days })
    return null
  },
})

const trashDaysOf = (user: Doc<"users"> | null) => user?.trashDays ?? defaultTrashDays

const trashSettings = authedQuery({
  args: {},
  returns: v.object({ trashDays: v.number(), archiveDays: v.number() }),
  handler: async (ctx) => ({
    trashDays: trashDaysOf(await ctx.db.get("users", ctx.userId)),
    archiveDays,
  }),
})

/** The daily sweep: archived applications past `archiveDays` move to the Trash, and
 * trashed ones past their owner's `trashDays` are deleted. A batch at a time; whatever's
 * left goes the next day. Returns how many it moved and deleted. */
const sweep = internalMutation({
  args: {},
  returns: v.object({ trashed: v.number(), deleted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now()
    const stale = await ctx.db
      .query("applications")
      .withIndex("by_archivedAt", (q) =>
        q.gt("archivedAt", 0).lt("archivedAt", now - archiveDays * day)
      )
      .take(200)
    let trashed = 0
    for (const application of stale)
      if (application.trashedAt === undefined) {
        await ctx.db.patch("applications", application._id, { trashedAt: now })
        trashed++
      }
    // The shortest choice is 30 days, so nothing newer can be due.
    const old = await ctx.db
      .query("applications")
      .withIndex("by_trashedAt", (q) => q.gt("trashedAt", 0).lt("trashedAt", now - 30 * day))
      .take(200)
    const days = new Map<Id<"users">, number>()
    let deleted = 0
    for (const application of old) {
      if (!days.has(application.userId))
        days.set(application.userId, trashDaysOf(await ctx.db.get("users", application.userId)))
      const keep = days.get(application.userId)!
      if (keep === 0 || application.trashedAt! > now - keep * day) continue
      await deleteApplication(ctx, application)
      deleted++
    }
    return { trashed, deleted }
  },
})

export const trashApi = {
  trashed,
  archive,
  trash,
  restore,
  deleteForever,
  emptyTrash,
  setTrashDays,
  trashSettings,
  sweep,
}
