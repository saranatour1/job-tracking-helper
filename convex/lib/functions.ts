import { getAuthUserId } from "@convex-dev/auth/server"
import {
  customCtx,
  customMutation,
  customQuery,
  type CustomCtx,
} from "convex-helpers/server/customFunctions"
import type { Type } from "arktype"
import type { Validator } from "convex/values"
import type { ReturnValueForOptionalValidator } from "convex/server"
import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { type ActionCtx, env, mutation, type QueryCtx, query } from "../_generated/server"
import { arkToConvex, checked } from "./ark"

/** The signed-in person, if they get the app. Anyone can make an anonymous account, to search
 * Jobs, so on production those reach nothing else: no AI, Firecrawl, mail or connected agents.
 * Local dev's guests get the whole app. */
export const memberId = async (ctx: QueryCtx | ActionCtx): Promise<Id<"users"> | null> => {
  const userId = await getAuthUserId(ctx)
  if (!userId) return null
  const anonymous: boolean =
    "db" in ctx
      ? Boolean((await ctx.db.get("users", userId))?.anonymous)
      : await ctx.runQuery(internal.api.users.isAnonymous, { userId })
  return anonymous && !env.SITE_URL.startsWith("http://localhost") ? null : userId
}

const signedIn = customCtx(async (ctx: QueryCtx) => {
  const userId = await memberId(ctx)
  if (!userId) throw new Error("Not signed in")
  return { userId }
})

export const authedQuery = customQuery(query, signedIn)
export const authedMutation = customMutation(mutation, signedIn)

// For the few things an anonymous account may do.
const hasSession = customCtx(async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Not signed in")
  return { userId }
})

export const sessionQuery = customQuery(query, hasSession)
export const sessionMutation = customMutation(mutation, hasSession)

export const arkMutation = <
  T extends Type<object>,
  R extends Validator<unknown, "required", string>,
>(def: {
  args: T
  returns: R
  handler: (
    ctx: CustomCtx<typeof authedMutation>,
    args: T["infer"]
  ) => ReturnValueForOptionalValidator<R>
}) =>
  authedMutation({
    args: arkToConvex(def.args),
    returns: def.returns,
    handler: (ctx, args) => def.handler(ctx, checked(def.args, args)),
  })
