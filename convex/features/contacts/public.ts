import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { action, type ActionCtx, internalAction } from "../../_generated/server"
import { arkOutputToConvex, arkToConvex, checked } from "../../lib/ark"
import { authedMutation, authedQuery } from "../../lib/functions"
import { seal } from "../../lib/secrets"
import { keys, openJson, secretKeys, threadKeyOf, userIdOf } from "../email/utils"
import { contactAad } from "./internal"
import { ContactDetails, SaveContact, vContactRow } from "./validators"
import { logEdit, logEditFromAction } from "../activity/utils"
import { limits } from "../workflows/manager"

export const openedContacts = async (userId: Id<"users">, rows: Doc<"contacts">[]) => {
  const k = await keys().catch(() => null)
  if (!k) return []
  const opened = await Promise.all(
    rows
      .filter((c) => !c.hidden)
      .map(async (c) => {
        const details = await openJson(k, c.details, contactAad(userId), ContactDetails)
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
  return opened.filter((c) => c !== null)
}

const list = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vContactRow),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("contacts")
      .withIndex("by_userId_and_lastAt", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate(paginationOpts)
    return { ...result, page: await openedContacts(ctx.userId, result.page) }
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

const saveContact = async (ctx: ActionCtx, userId: Id<"users">, args: unknown) => {
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
  return { ...details, email }
}

// Sealing needs real randomness, so this is an action.
const save = action({
  args: arkToConvex(SaveContact),
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await userIdOf(ctx)
    await saveContact(ctx, userId, args)
    await logEditFromAction(
      ctx,
      userId,
      "contact.save",
      args.id ? "Changed a contact" : "Added a contact"
    )
    return null
  },
})

const addFor = internalAction({
  args: { userId: v.id("users"), contact: arkToConvex(SaveContact.omit("id")) },
  returns: arkOutputToConvex(ContactDetails),
  handler: async (ctx, { userId, contact }): Promise<typeof ContactDetails.infer> => {
    const { ok } = await limits.limit(ctx, "agentContact", { key: userId })
    if (!ok) throw new ConvexError("That's 100 contacts added today. Try again tomorrow.")
    const added = await saveContact(ctx, userId, contact)
    await logEditFromAction(ctx, userId, "contact.save", "A connected agent added a contact")
    return added
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

export const publicApi = { list, known, save, addFor, remove }
