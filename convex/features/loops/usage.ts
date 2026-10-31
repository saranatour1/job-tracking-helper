import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { monthOf } from "../workflows/sources"
import type { Provider } from "./catalog"

export const usageOf = (ctx: QueryCtx, provider: Provider, month: string) =>
  ctx.db
    .query("sourceUsage")
    .withIndex("by_provider_and_month", (q) => q.eq("provider", provider).eq("month", month))
    .unique()

export const addUsage = async (
  ctx: MutationCtx,
  provider: Provider,
  credits: number,
  exhausted: boolean
) => {
  const month = monthOf(Date.now())
  const usage = await usageOf(ctx, provider, month)
  const exhaustedAt = exhausted ? Date.now() : usage?.exhaustedAt
  if (usage)
    await ctx.db.patch("sourceUsage", usage._id, { used: usage.used + credits, exhaustedAt })
  else
    await ctx.db.insert("sourceUsage", {
      provider,
      month,
      used: credits,
      ...(exhaustedAt && { exhaustedAt }),
    })
}
