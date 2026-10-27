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
import { mutation, query } from "../_generated/server"
import { arkToConvex } from "./ark"

const signedIn = customCtx(async (ctx: Parameters<typeof getAuthUserId>[0]) => {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Not signed in")
  return { userId }
})

// Public functions that need the caller's user id as ctx.userId.
export const authedQuery = customQuery(query, signedIn)
export const authedMutation = customMutation(mutation, signedIn)

// Convex checks the args' shape, and the arktype type then applies the rules
// Convex can't express, such as trimming, before the handler runs.
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
    handler: (ctx, args) => def.handler(ctx, def.args.assert(args)),
  })
