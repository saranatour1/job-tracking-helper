import { ConvexError } from "convex/values"
import { components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"

type Owned = "jobLeads" | "loops" | "prefills" | "goals" | "views" | "automations"

/** The check on every id an agent passes in. A bad id, someone else's id and a deleted row all
 * get the same answer, so ids can't be probed. */
export const mine = async <T extends Owned>(
  ctx: QueryCtx,
  table: T,
  userId: Id<"users">,
  id: string,
  missing: string
) => {
  const found = ctx.db.normalizeId(table, id)
  const row = found && ((await ctx.db.get(table, found)) as Doc<Owned> | null)
  if (!row || row.userId !== userId) throw new ConvexError(missing)
  return row as unknown as Doc<T>
}

/** Deleting an account keeps its user id, and sign-in can reuse it, so its agents must go too. */
export const removeAgents = async (ctx: MutationCtx, userId: Id<"users">) => {
  await revokeAgents(ctx, userId)
  // A code approved moments before can still become a connection for its minute of life, and the
  // component has no way to cancel one, so look again once they've all run out.
  await ctx.scheduler.runAfter(2 * 60 * 1000, internal.api.agents.revokeAgain, { userId })
}

export const revokeAgents = async (ctx: MutationCtx, userId: Id<"users">) => {
  for (;;) {
    const grants = await ctx.runQuery(components.mcp.grants.list, { userId })
    if (!grants.length) return
    for (const { _id } of grants)
      await ctx.runMutation(components.mcp.grants.revoke, { userId, grantId: _id })
  }
}
