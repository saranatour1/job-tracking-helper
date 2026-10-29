import { ConvexError, v } from "convex/values"
import { internal } from "../../../_generated/api"
import type { Doc, Id } from "../../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../../_generated/server"
import { authedMutation, authedQuery } from "../../../lib/functions"
import schema from "../../../schema"

// Archived applications leave the board but stay; after `archiveDays` they move to the
// Trash. The Trash keeps them out of everything, and each trashed one carries `purgeAt`,
// when it's deleted for good, from its owner's `trashDays`. A daily sweep does both, a
// small batch at a time, so no one's big Trash holds up anyone else's.

const day = 24 * 60 * 60 * 1000
const batch = 25
export const archiveDays = 30
export const defaultTrashDays = 90
export const trashDayChoices = [0, 30, 90, 180, 365] as const

const own = async (ctx: MutationCtx, userId: Id<"users">, id: Id<"applications">) => {
  const application = await ctx.db.get("applications", id)
  if (application?.userId !== userId) throw new ConvexError("That application isn't yours.")
  return application
}

const trashDaysOf = (user: Doc<"users"> | null) => user?.trashDays ?? defaultTrashDays
const purgeAtOf = (trashedAt: number, days: number) => (days ? trashedAt + days * day : undefined)

/** Deletes an application for good, and unlinks what pointed at it: its mail stays as
 * unfiled, events stay on the calendar, booking pages go back to matching by email, and a
 * job lead stays tracked so loops never offer the role again. */
export const deleteApplication = async (ctx: MutationCtx, application: Doc<"applications">) => {
  const { userId, _id: applicationId } = application
  for (const mail of await ctx.db
    .query("mailEvents")
    .withIndex("by_userId_and_applicationId", (q) =>
      q.eq("userId", userId).eq("applicationId", applicationId)
    )
    .take(500))
    await ctx.db.patch("mailEvents", mail._id, { applicationId: undefined, suggest: undefined })
  for (const lead of await ctx.db
    .query("jobLeads")
    .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId))
    .take(50))
    await ctx.db.patch("jobLeads", lead._id, { applicationId: undefined })
  for (const event of await ctx.db
    .query("calendarEvents")
    .withIndex("by_userId_and_applicationId", (q) =>
      q.eq("userId", userId).eq("applicationId", applicationId)
    )
    .take(500))
    await ctx.db.patch("calendarEvents", event._id, { applicationId: undefined })
  for (const page of await ctx.db
    .query("bookingPages")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(50))
    if (page.applicationId === applicationId)
      await ctx.db.patch("bookingPages", page._id, { applicationId: undefined })
  await ctx.db.delete("applications", applicationId)
}

/** Puts an application in the Trash: out of the Archive, with its date to go for good. */
const moveToTrash = async (ctx: MutationCtx, application: Doc<"applications">) => {
  const now = Date.now()
  const days = trashDaysOf(await ctx.db.get("users", application.userId))
  await ctx.db.patch("applications", application._id, {
    trashedAt: now,
    archivedAt: undefined,
    purgeAt: purgeAtOf(now, days),
  })
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
    await moveToTrash(ctx, await own(ctx, ctx.userId, id))
    return null
  },
})

/** Back on the board, out of the Archive too. */
const restore = authedMutation({
  args: { id: v.id("applications") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await own(ctx, ctx.userId, id)
    await ctx.db.patch("applications", id, {
      trashedAt: undefined,
      archivedAt: undefined,
      purgeAt: undefined,
    })
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

// One batch of someone's Trash, and the next scheduled while any is left, so emptying a
// big Trash stays within a mutation's limits.
const emptySome = async (ctx: MutationCtx, userId: Id<"users">) => {
  const all = await ctx.db
    .query("applications")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect()
  const inTrash = all.filter((a) => a.trashedAt !== undefined)
  for (const application of inTrash.slice(0, batch)) await deleteApplication(ctx, application)
  if (inTrash.length > batch)
    await ctx.scheduler.runAfter(0, internal.applications.emptyTrashFor, { userId })
  return inTrash.length
}

/** Deletes everything in the Trash for good. Returns how many were in it. */
const emptyTrash = authedMutation({
  args: {},
  returns: v.number(),
  handler: (ctx) => emptySome(ctx, ctx.userId),
})

const emptyTrashFor = internalMutation({
  args: { userId: v.id("users") },
  returns: v.number(),
  handler: (ctx, { userId }) => emptySome(ctx, userId),
})

/** How long the Trash keeps things; what's already in it moves to the new date. */
const setTrashDays = authedMutation({
  args: { days: v.number() },
  returns: v.null(),
  handler: async (ctx, { days }) => {
    if (!(trashDayChoices as readonly number[]).includes(days))
      throw new ConvexError("Pick one of the choices.")
    await ctx.db.patch("users", ctx.userId, { trashDays: days })
    const all = await ctx.db
      .query("applications")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect()
    for (const application of all)
      if (application.trashedAt !== undefined)
        await ctx.db.patch("applications", application._id, {
          purgeAt: purgeAtOf(application.trashedAt, days),
        })
    return null
  },
})

const trashSettings = authedQuery({
  args: {},
  returns: v.object({ trashDays: v.number(), archiveDays: v.number() }),
  handler: async (ctx) => ({
    trashDays: trashDaysOf(await ctx.db.get("users", ctx.userId)),
    archiveDays,
  }),
})

/** The daily sweep: archived applications past `archiveDays` move to the Trash, and
 * trashed ones past their `purgeAt` are deleted, a batch of each at a time; it runs again
 * at once while a batch came back full. Returns how many it moved and deleted. */
const sweep = internalMutation({
  args: {},
  returns: v.object({ trashed: v.number(), deleted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now()
    // Trashing clears archivedAt, so everything in this range still needs moving.
    const stale = await ctx.db
      .query("applications")
      .withIndex("by_archivedAt", (q) =>
        q.gt("archivedAt", 0).lt("archivedAt", now - archiveDays * day)
      )
      .take(batch * 2)
    for (const application of stale) await moveToTrash(ctx, application)
    const due = await ctx.db
      .query("applications")
      .withIndex("by_purgeAt", (q) => q.gt("purgeAt", 0).lte("purgeAt", now))
      .take(batch)
    for (const application of due) await deleteApplication(ctx, application)
    if (stale.length === batch * 2 || due.length === batch)
      await ctx.scheduler.runAfter(0, internal.applications.sweep, {})
    return { trashed: stale.length, deleted: due.length }
  },
})

export const trashApi = {
  trashed,
  archive,
  trash,
  restore,
  deleteForever,
  emptyTrash,
  emptyTrashFor,
  setTrashDays,
  trashSettings,
  sweep,
}
