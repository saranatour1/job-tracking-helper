import { v } from "convex/values"
import schema from "../../schema"
import { arkMutation, authedQuery } from "../../lib/functions"
import { Application } from "./validators"

const list = authedQuery({
  args: {},
  returns: v.array(schema.doc("applications")),
  handler: (ctx) =>
    ctx.db
      .query("applications")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect(),
})

const add = arkMutation({
  args: Application,
  returns: v.id("applications"),
  handler: (ctx, application) =>
    ctx.db.insert("applications", { ...application, userId: ctx.userId }),
})

export const applicationsApi = { list, add }
