import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { internal } from "../../_generated/api"
import { action } from "../../_generated/server"
import { arkToConvex, checked } from "../../lib/ark"
import { authedMutation, authedQuery } from "../../lib/functions"
import { seal } from "../../lib/secrets"
import { keys, openJson, secretKeys, threadKeyOf, userIdOf } from "../email/utils"
import { contactAad } from "./internal"
import { ContactDetails, SaveContact, vContactRow } from "./validators"
import { logEdit, logEditFromAction } from "../activity/utils"

const list = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vContactRow),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("contacts")
      .withIndex("by_userId_and_lastAt", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate(paginationOpts)
    const k = await keys().catch(() => null)
    if (!k) return { ...result, page: [] }
    const opened = await Promise.all(
      result.page
        .filter((c) => !c.hidden)
        .map(async (c) => {
          const details = await openJson(k, c.details, contactAad(ctx.userId), ContactDetails)
          return (
            details && {
              ...details,
              id: c._id,
              count: c.count,
              lastAt: c.lastAt,
              ...(c.applicationId && { applicationId: c.applicationId }),
            }
          )
        })
    )
    return { ...result, page: opened.filter((c) => c !== null) }
  },
})

const known = authedQuery({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { email }) => {
    const key = await threadKeyOf(ctx.userId, email.toLowerCase())
    const row = await ctx.db
      .query("contacts")
      .withIndex("by_userId_and_key", (q) => q.eq("userId", ctx.userId).eq("key", key))
      .first()
    return row !== null && !row.hidden
  },
})

// Sealing needs real randomness, so this is an action.
const save = action({
  args: arkToConvex(SaveContact),
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await userIdOf(ctx)
    const { id, ...details } = checked(SaveContact, args)
    if (!details.name && !details.email) throw new ConvexError("Give it a name or an email.")
    const k = await secretKeys()
    const email = details.email.toLowerCase()
    const result = await ctx.runMutation(internal.api.contacts.store, {
      userId,
      ...(id && { id }),
      key: email ? await threadKeyOf(userId, email) : crypto.randomUUID(),
      details: await seal(k, JSON.stringify({ ...details, email }), contactAad(userId)),
    })
    if (result === "taken") throw new ConvexError("You already have a contact with that email.")
    if (result === "gone") throw new ConvexError("That contact isn't here anymore.")
    await logEditFromAction(
      ctx,
      userId,
      "contact.save",
      id ? "Changed a contact" : "Added a contact"
    )
    return null
  },
})

const remove = authedMutation({
  args: { id: v.id("contacts") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("contacts", id)
    if (row?.userId !== ctx.userId) throw new ConvexError("That contact isn't yours.")
    if (row.count > 0) await ctx.db.patch("contacts", id, { hidden: true })
    else await ctx.db.delete("contacts", id)
    await logEdit(ctx, ctx.userId, "contact.remove", "Removed a contact")
    return null
  },
})

export const publicApi = { list, known, save, remove }
