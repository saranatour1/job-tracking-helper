import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { roleKey } from "../workflows/fit"

/** What the person was shown of this role: this posting, or another posting of the same role. */
export const leadOf = async (
  ctx: QueryCtx,
  userId: Id<"users">,
  job: Pick<Doc<"jobs">, "urlKey" | "company" | "title" | "location">
) =>
  (await ctx.db
    .query("jobLeads")
    .withIndex("by_userId_and_urlKey", (i) => i.eq("userId", userId).eq("urlKey", job.urlKey))
    .first()) ??
  (await ctx.db
    .query("jobLeads")
    .withIndex("by_userId_and_roleKey", (i) => i.eq("userId", userId).eq("roleKey", roleKey(job)))
    .first())
