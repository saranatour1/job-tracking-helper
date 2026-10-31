import { ConvexError, v } from "convex/values"
import schema from "../../schema"
import { arkMutation, authedMutation, authedQuery } from "../../lib/functions"
import { internal } from "../../_generated/api"
import { fireEvent } from "../automations/fire"
import {
  Application,
  limits,
  maxApplications,
  UpdateApplication,
  SetStatus,
  AddNote,
} from "./validators"
import { own, capped, nextNumber, changeStatus } from "./utils"

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("applications")),
  // The Trash keeps its own list (`trashed`); archived ones are here, marked.
  handler: async (ctx) =>
    (
      await ctx.db
        .query("applications")
        .withIndex("by_userId_and_trashedAt", (q) =>
          q.eq("userId", ctx.userId).eq("trashedAt", undefined)
        )
        .order("desc")
        .take(maxApplications)
    ).reverse(),
})

// Added with a link, Jev checks the job in the background and fills in the rest.
const add = arkMutation({
  args: Application,
  returns: v.id("applications"),
  handler: async (ctx, application) => {
    const applicationId = await ctx.db.insert("applications", {
      ...application,
      userId: ctx.userId,
      number: await nextNumber(ctx, ctx.userId),
      history: [{ status: application.status, at: Date.now() }],
    })
    if (application.url)
      await ctx.scheduler.runAfter(0, internal.loops.enrichApplication, {
        userId: ctx.userId,
        applicationId,
        url: application.url,
      })
    return applicationId
  },
})

// Sets any of the details. Status has its own mutation, so its history stays right.
const update = arkMutation({
  args: UpdateApplication,
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    await own(ctx, ctx.userId, id)
    await ctx.db.patch("applications", id, patch)
    return null
  },
})

const setStatus = arkMutation({
  args: SetStatus,
  returns: v.null(),
  handler: async (ctx, { id, status, note }) => {
    await changeStatus(ctx, await own(ctx, ctx.userId, id), status, note)
    return null
  },
})

const setGoal = authedMutation({
  args: { id: v.id("applications"), goalId: v.optional(v.id("goals")) },
  returns: v.null(),
  handler: async (ctx, { id, goalId }) => {
    const application = await own(ctx, ctx.userId, id)
    if (goalId && (await ctx.db.get("goals", goalId))?.userId !== ctx.userId)
      throw new ConvexError("That goal isn't yours.")
    // Leaving `goalId` out clears it.
    await ctx.db.patch("applications", id, { goalId })
    if (goalId && goalId !== application.goalId)
      await fireEvent(ctx, ctx.userId, { kind: "goal", goalId, applicationId: id })
    return null
  },
})

const addNote = arkMutation({
  args: AddNote,
  returns: v.null(),
  handler: async (ctx, { id, text }) => {
    const application = await own(ctx, ctx.userId, id)
    await ctx.db.patch("applications", id, {
      notes: capped([...(application.notes ?? []), { text, at: Date.now() }], limits.notes),
    })
    return null
  },
})

export const publicApi = { list, add, update, setStatus, addNote, setGoal }
