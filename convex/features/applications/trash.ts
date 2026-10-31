import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { internal } from "../../_generated/api"
import { internalMutation } from "../../_generated/server"
import { authedMutation, authedQuery } from "../../lib/functions"
import schema from "../../schema"
import { startDelete } from "../deletes/utils"
import { archiveDays, trashDayChoices } from "./validators"
import {
  day,
  batch,
  ownAnywhere,
  trashDaysOf,
  purgeAtOf,
  deleteApplication,
  moveToTrash,
} from "./utils"
import { logEdit } from "../activity/utils"

/** What's in the Trash, newest first. */
const trashed = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("applications")),
  handler: (ctx, { paginationOpts }) =>
    ctx.db
      .query("applications")
      .withIndex("by_userId_and_trashedAt", (q) => q.eq("userId", ctx.userId).gt("trashedAt", 0))
      .order("desc")
      .paginate(paginationOpts),
})

const archive = authedMutation({
  args: { id: v.id("applications"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { id, archived }) => {
    const { company } = await ownAnywhere(ctx, ctx.userId, id)
    await ctx.db.patch("applications", id, { archivedAt: archived ? Date.now() : undefined })
    await logEdit(
      ctx,
      ctx.userId,
      "application.archive",
      `${archived ? "Archived" : "Unarchived"} ${company}`,
      { applicationId: id }
    )
    return null
  },
})

const trash = authedMutation({
  args: { id: v.id("applications") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const application = await ownAnywhere(ctx, ctx.userId, id)
    await moveToTrash(ctx, application)
    await logEdit(
      ctx,
      ctx.userId,
      "application.trash",
      `Moved ${application.company} to the Trash`,
      { applicationId: id }
    )
    return null
  },
})

/** Back on the board, out of the Archive too. */
const restore = authedMutation({
  args: { id: v.id("applications") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { company } = await ownAnywhere(ctx, ctx.userId, id)
    await ctx.db.patch("applications", id, {
      trashedAt: undefined,
      archivedAt: undefined,
      purgeAt: undefined,
    })
    await logEdit(ctx, ctx.userId, "application.restore", `Restored ${company}`, {
      applicationId: id,
    })
    return null
  },
})

/** Deletes one application from the Trash now. */
const deleteForever = authedMutation({
  args: { id: v.id("applications") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const application = await ownAnywhere(ctx, ctx.userId, id)
    if (application.trashedAt === undefined)
      throw new ConvexError("Move it to the Trash before deleting it.")
    await deleteApplication(ctx, application)
    await logEdit(ctx, ctx.userId, "application.delete", `Deleted ${application.company} for good`)
    return null
  },
})

/** Deletes everything in the Trash for good, in batches. */
const emptyTrash = authedMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await startDelete(ctx, { kind: "trash", userId: ctx.userId, before: Date.now() })
    await logEdit(ctx, ctx.userId, "application.delete", "Emptied the Trash")
    return null
  },
})

/** How long the Trash keeps things; what's already in it moves to the new date. */
const setTrashDays = authedMutation({
  args: { days: v.number() },
  returns: v.null(),
  handler: async (ctx, { days }) => {
    if (!(trashDayChoices as readonly number[]).includes(days))
      throw new ConvexError("Pick one of the choices.")
    await ctx.db.patch("users", ctx.userId, { trashDays: days })
    // Bounded by the Trash itself, which is at most everything on the board.
    for await (const application of ctx.db
      .query("applications")
      .withIndex("by_userId_and_trashedAt", (q) => q.eq("userId", ctx.userId).gt("trashedAt", 0)))
      await ctx.db.patch("applications", application._id, {
        purgeAt: purgeAtOf(application.trashedAt!, days),
      })
    await logEdit(ctx, ctx.userId, "account.trash", "Changed how long the Trash keeps things")
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

/** The daily sweep: archived applications past `archiveDays` move to the Trash, a batch at a
 * time, running again at once while a batch came back full. Trashed ones past their `purgeAt`
 * go to the batch worker. Returns how many it moved, and whether any were due. */
const sweep = internalMutation({
  args: {},
  returns: v.object({ trashed: v.number(), due: v.boolean() }),
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
      .first()
    if (due) await startDelete(ctx, { kind: "expiredTrash", before: now })
    if (stale.length === batch * 2)
      await ctx.scheduler.runAfter(0, internal.api.applications.sweep, {})
    return { trashed: stale.length, due: due !== null }
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
