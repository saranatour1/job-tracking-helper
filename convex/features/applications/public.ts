import { ConvexError, v } from "convex/values"
import { docOf } from "../../lib/docs"
import { applicationsTable } from "./models"
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
import { vCard } from "./models"
import { own, capped, cardOf, logNewApplication, nextNumber, changeStatus, syncSend } from "./utils"
import { logEdit } from "../activity/utils"

const list = authedQuery({
  args: {},
  returns: v.array(vCard),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("applications")
        .withIndex("by_userId_and_trashedAt", (q) =>
          q.eq("userId", ctx.userId).eq("trashedAt", undefined)
        )
        .order("desc")
        .take(maxApplications)
    )
      .reverse()
      .map(cardOf),
})

// From a link: its route text ("app-12") or, for older links, its id.
const get = authedQuery({
  args: { ref: v.string() },
  returns: v.union(docOf("applications", applicationsTable), v.null()),
  handler: async (ctx, { ref }) => {
    const number = /^app-(\d+)$/.exec(ref)?.[1]
    const id = ctx.db.normalizeId("applications", ref)
    const application = number
      ? await ctx.db
          .query("applications")
          .withIndex("by_userId_and_number", (q) =>
            q.eq("userId", ctx.userId).eq("number", Number(number))
          )
          .first()
      : id && (await ctx.db.get("applications", id))
    return application?.userId === ctx.userId && application.trashedAt === undefined
      ? application
      : null
  },
})

const numberOf = authedQuery({
  args: { id: v.id("applications") },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { id }) => {
    const application = await ctx.db.get("applications", id)
    return application?.userId === ctx.userId ? application.number : null
  },
})

const sends = authedQuery({
  args: {},
  returns: v.array(v.number()),
  handler: async (ctx) =>
    (
      await ctx.db
        .query("applicationSends")
        .withIndex("by_userId_and_at", (q) => q.eq("userId", ctx.userId))
        .order("desc")
        .take(maxApplications)
    ).map((send) => send.at),
})

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
    await syncSend(ctx, ctx.userId, applicationId, application.status)
    await logNewApplication(ctx, ctx.userId, applicationId, application.company)
    if (application.url)
      await ctx.scheduler.runAfter(0, internal.api.loopActions.enrichApplication, {
        userId: ctx.userId,
        applicationId,
        url: application.url,
      })
    return applicationId
  },
})

const update = arkMutation({
  args: UpdateApplication,
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    const { company } = await own(ctx, ctx.userId, id)
    await ctx.db.patch("applications", id, patch)
    await logEdit(ctx, ctx.userId, "application.edit", `Edited ${company}`, { applicationId: id })
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
    await ctx.db.patch("applications", id, { goalId })
    if (goalId && goalId !== application.goalId)
      await fireEvent(ctx, ctx.userId, { kind: "goal", goalId, applicationId: id })
    await logEdit(
      ctx,
      ctx.userId,
      "application.goal",
      `Changed the goal on ${application.company}`,
      { applicationId: id }
    )
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
    await logEdit(ctx, ctx.userId, "application.note", `Added a note to ${application.company}`, {
      applicationId: id,
    })
    return null
  },
})

export const publicApi = { list, get, numberOf, sends, add, update, setStatus, addNote, setGoal }
