import { type } from "arktype"
import { ConvexError, v } from "convex/values"
import schema from "../../../schema"
import type { Doc, Id } from "../../../_generated/dataModel"
import type { MutationCtx } from "../../../_generated/server"
import { arkId } from "../../../lib/ark"
import { arkMutation, authedQuery } from "../../../lib/functions"
import { internal } from "../../../_generated/api"
import { fireEvent } from "../automations/fire"
import { Application, Details, limits, priorityFor, type Status, statuses } from "./validators"

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("applications")),
  // The Trash keeps its own list (`trashed`); archived ones are here, marked.
  handler: async (ctx) =>
    (
      await ctx.db
        .query("applications")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .collect()
    ).filter((a) => a.trashedAt === undefined),
})

const own = async (ctx: MutationCtx, userId: Id<"users">, id: Id<"applications">) => {
  const application = await ctx.db.get("applications", id)
  if (application?.userId !== userId) throw new ConvexError("That application isn't yours.")
  return application
}

const capped = <T>(items: T[], max: number) => items.slice(-max)

// The next APP number for someone. Applications from before numbers existed get theirs
// here, oldest first, so every code stays unique and in order.
export const nextNumber = async (ctx: MutationCtx, userId: Id<"users">) => {
  // shortcut: reads all of a person's applications; keep a counter on users past a few thousand.
  const all = await ctx.db
    .query("applications")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect()
  let next = Math.max(0, ...all.map((a) => a.number ?? 0)) + 1
  for (const a of all)
    if (a.number === undefined) await ctx.db.patch("applications", a._id, { number: next++ })
  return next
}

// Every status change goes through here, so history stays complete: the tracker, a
// suggestion from an email, anything later.
export const changeStatus = async (
  ctx: MutationCtx,
  application: Doc<"applications">,
  status: Status,
  note?: string,
  // Quiet moves start no workflows: a workflow's own Move application step is one.
  { quiet = false }: { quiet?: boolean } = {}
) => {
  if (application.status === status) return
  if (!quiet)
    await fireEvent(ctx, application.userId, {
      kind: "status",
      from: application.status,
      to: status,
      applicationId: application._id,
    })
  const history = application.history ?? [
    { status: application.status, at: application._creationTime },
  ]
  await ctx.db.patch("applications", application._id, {
    status,
    history: capped(
      [...history, { status, at: Date.now(), ...(note && { note }) }],
      limits.history
    ),
  })
}

// Fills an application's empty details from the job Jev checked for it: priority from
// the match, location, a Remote label and a description. What the person set stays.
export const fillFromJob = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  applicationId: Id<"applications">,
  job: { fit: number; location?: string; snippet?: string }
) => {
  const application = await ctx.db.get("applications", applicationId)
  if (application?.userId !== userId) return
  const labels = application.labels ?? []
  const remote = /remote/i.test(job.location ?? "") && !labels.includes("Remote")
  await ctx.db.patch("applications", applicationId, {
    ...((application.priority ?? "none") === "none" && { priority: priorityFor(job.fit) }),
    ...(!application.location && job.location && { location: job.location }),
    ...(!application.description && job.snippet && { description: job.snippet }),
    ...(remote && { labels: [...labels, "Remote"] }),
  })
}

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
  args: type({ id: arkId("applications") })
    .and(Details)
    .and({
      "company?": type("string.trim").to("string > 0"),
      "role?": type("string.trim").to("string > 0"),
    }),
  returns: v.null(),
  handler: async (ctx, { id, ...patch }) => {
    await own(ctx, ctx.userId, id)
    await ctx.db.patch("applications", id, patch)
    return null
  },
})

const setStatus = arkMutation({
  args: type({
    id: arkId("applications"),
    status: type.enumerated(...statuses),
    "note?": "string <= 500",
  }),
  returns: v.null(),
  handler: async (ctx, { id, status, note }) => {
    await changeStatus(ctx, await own(ctx, ctx.userId, id), status, note)
    return null
  },
})

const addNote = arkMutation({
  args: type({ id: arkId("applications"), text: type("string.trim").to("0 < string <= 5000") }),
  returns: v.null(),
  handler: async (ctx, { id, text }) => {
    const application = await own(ctx, ctx.userId, id)
    await ctx.db.patch("applications", id, {
      notes: capped([...(application.notes ?? []), { text, at: Date.now() }], limits.notes),
    })
    return null
  },
})

export const publicApi = { list, add, update, setStatus, addNote }
