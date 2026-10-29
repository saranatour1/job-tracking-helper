import { type } from "arktype"
import { ConvexError, v } from "convex/values"
import schema from "../../../schema"
import type { Doc, Id } from "../../../_generated/dataModel"
import type { MutationCtx } from "../../../_generated/server"
import { arkId } from "../../../lib/ark"
import { arkMutation, authedQuery } from "../../../lib/functions"
import { Application, Details, limits, type Status, statuses } from "./validators"

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("applications")),
  handler: (ctx) =>
    ctx.db
      .query("applications")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect(),
})

const own = async (ctx: MutationCtx, userId: Id<"users">, id: Id<"applications">) => {
  const application = await ctx.db.get("applications", id)
  if (application?.userId !== userId) throw new ConvexError("That application isn't yours.")
  return application
}

const capped = <T>(items: T[], max: number) => items.slice(-max)

// Every status change goes through here, so history stays complete: the tracker, a
// suggestion from an email, anything later.
export const changeStatus = async (
  ctx: MutationCtx,
  application: Doc<"applications">,
  status: Status,
  note?: string
) => {
  if (application.status === status) return
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

const add = arkMutation({
  args: Application,
  returns: v.id("applications"),
  handler: (ctx, application) =>
    ctx.db.insert("applications", {
      ...application,
      userId: ctx.userId,
      history: [{ status: application.status, at: Date.now() }],
    }),
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
