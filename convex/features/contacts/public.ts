import { ConvexError, v } from "convex/values"
import { internal } from "../../_generated/api"
import { action } from "../../_generated/server"
import { arkToConvex, checked } from "../../lib/ark"
import { authedMutation, authedQuery } from "../../lib/functions"
import { seal } from "../../lib/secrets"
import { keys, openJson, secretKeys, threadKeyOf, userIdOf } from "../email/utils"
import { contactAad } from "./internal"
import { ContactDetails, maxContacts, SaveContact, vContactRow } from "./validators"

// Everyone you've dealt with, opened for you. By company, the one you've emailed most first.
const list = authedQuery({
  args: {},
  returns: v.array(vContactRow),
  handler: async (ctx) => {
    const k = await keys().catch(() => null)
    if (!k) return []
    const rows = await ctx.db
      .query("contacts")
      .withIndex("by_userId_and_lastAt", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(maxContacts)
    const opened = await Promise.all(
      rows
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
    return opened
      .filter((c) => c !== null)
      .sort(
        (a, b) => a.company.localeCompare(b.company) || b.count - a.count || b.lastAt - a.lastAt
      )
  },
})

// Whether someone's already a contact. One you removed isn't, so you can add them back.
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
    const result = await ctx.runMutation(internal.contacts.store, {
      userId,
      ...(id && { id }),
      // With no address there's nothing to match later mail to, so any unique key will do.
      key: email ? await threadKeyOf(userId, email) : crypto.randomUUID(),
      details: await seal(k, JSON.stringify({ ...details, email }), contactAad(userId)),
    })
    if (result === "taken") throw new ConvexError("You already have a contact with that email.")
    if (result === "gone") throw new ConvexError("That contact isn't here anymore.")
    return null
  },
})

// One that came from mail stays as a hidden row, or the next email would bring it back.
const remove = authedMutation({
  args: { id: v.id("contacts") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("contacts", id)
    if (row?.userId !== ctx.userId) throw new ConvexError("That contact isn't yours.")
    if (row.count > 0) await ctx.db.patch("contacts", id, { hidden: true })
    else await ctx.db.delete("contacts", id)
    return null
  },
})

export const publicApi = { list, known, save, remove }
