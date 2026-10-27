import { getAuthUserId } from "@convex-dev/auth/server"
import {
  customCtx,
  customMutation,
  customQuery,
  type CustomCtx,
} from "convex-helpers/server/customFunctions"
import type { Type } from "arktype"
import { v, type Validator } from "convex/values"
import type { ReturnValueForOptionalValidator } from "convex/server"
import { mutation, query } from "../_generated/server"

const signedIn = customCtx(async (ctx: Parameters<typeof getAuthUserId>[0]) => {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Not signed in")
  return { userId }
})

// Public functions that need the caller's user id as ctx.userId.
export const authedQuery = customQuery(query, signedIn)
export const authedMutation = customMutation(mutation, signedIn)

// Convex can't read arktype, so it accepts any args and arktype checks them before
// the handler runs. Clients still see the arktype input type. The trade-off: the
// dashboard and `convex function-spec` show these args as `any`.
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
    args: v.any() as Validator<T["inferIn"], "required", string>,
    returns: def.returns,
    handler: (ctx, args) => def.handler(ctx, def.args.assert(args)),
  })
