import { getAuthUserId } from "@convex-dev/auth/server"
import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { experimental_decide as decide } from "ai"
import { ConvexError, v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { action } from "../../_generated/server"
import type { FunctionReturnType } from "convex/server"
import { jevModel } from "../workflows/judge"
import { limits as rates } from "../workflows/manager"

type Verdicts = {
  add: Id<"applications">[]
  remove: Id<"applications">[]
  judged: number
}

// Asks Jev, for each of the person's applications, whether it counts toward the goal.
// Returns what to change, and the person confirms each one; nothing is written here.
const evaluate = action({
  args: { id: v.id("goals") },
  returns: v.object({
    add: v.array(v.id("applications")),
    remove: v.array(v.id("applications")),
    judged: v.number(),
  }),
  handler: async (ctx, { id }): Promise<Verdicts> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    const { ok } = await rates.limit(ctx, "goalEvaluate", { key: userId })
    if (!ok) throw new ConvexError("That's 10 re-evaluations today. Try again tomorrow.")
    const found: FunctionReturnType<typeof internal.goals.toEvaluate> = await ctx.runQuery(
      internal.goals.toEvaluate,
      { userId, id }
    )
    if (!found) throw new ConvexError("That goal isn't yours.")
    const verdicts = await Promise.all(
      found.applications.map(async ({ id, onGoal, ...application }) => {
        const result = await decide({
          model: convexGateway.evaluationModel(jevModel),
          state: { goal: found.goal, application },
          questions: {
            fits: {
              type: "boolean",
              instructions:
                "The goal is what the person's job search is for. Does this application count toward it: is it the kind of role, company or step the goal describes?",
            },
          },
        }).catch((cause: unknown) => {
          console.error("goals:evaluate", cause instanceof Error ? cause.message : cause)
          throw new ConvexError("Jev couldn't judge just now. Try again in a moment.")
        })
        const answer = (result.answers as Record<string, { probability?: number } | undefined>).fits
        return { id, onGoal, fits: (answer?.probability ?? 0) >= 0.5 }
      })
    )
    return {
      add: verdicts.filter((a) => a.fits && !a.onGoal).map((a) => a.id),
      remove: verdicts.filter((a) => !a.fits && a.onGoal).map((a) => a.id),
      judged: verdicts.length,
    }
  },
})

export const goalsActions = { evaluate }
