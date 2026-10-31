import { getAuthUserId } from "@convex-dev/auth/server"
import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { experimental_decide as decide } from "ai"
import { ConvexError, v } from "convex/values"
import { internal } from "../../_generated/api"
import { action } from "../../_generated/server"
import type { FunctionReturnType } from "convex/server"
import { type NoulAnswer, readNoul } from "../../lib/jev"
import { jevModel } from "../workflows/judge"
import { limits as rates } from "../workflows/manager"
import { type Verdicts, vVerdicts } from "./validators"

const evaluate = action({
  args: { id: v.id("goals") },
  returns: vVerdicts,
  handler: async (ctx, { id }): Promise<Verdicts> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    const { ok } = await rates.limit(ctx, "goalEvaluate", { key: userId })
    if (!ok) throw new ConvexError("That's 10 re-evaluations today. Try again tomorrow.")
    const found: FunctionReturnType<typeof internal.api.goals.toEvaluate> = await ctx.runQuery(
      internal.api.goals.toEvaluate,
      { userId, id }
    )
    if (!found) throw new ConvexError("That goal isn't yours.")
    if (found.applications.length === 0) return { add: [], remove: [], judged: 0 }
    const result = await decide({
      model: convexGateway.evaluationModel(jevModel),
      state: {
        goal: found.goal,
        applications: found.applications.map(({ id: _id, onGoal: _onGoal, ...a }) => a),
      },
      questions: Object.fromEntries(
        found.applications.map((_, i) => [
          `fits${i}`,
          {
            type: "boolean" as const,
            instructions: `\`goal\` is what the person's job search is for. Does \`applications[${i}]\` count toward it: is it the kind of role, company or step \`goal\` describes?`,
          },
        ])
      ),
    }).catch((cause: unknown) => {
      console.error("goals:evaluate", cause instanceof Error ? cause.message : cause)
      throw new ConvexError("Jev couldn't judge just now. Try again in a moment.")
    })
    const answers = result.answers as Record<string, NoulAnswer>
    const verdicts = found.applications.map((a, i) => ({
      ...a,
      fits: readNoul(answers[`fits${i}`]),
    }))
    return {
      add: verdicts.filter((a) => a.fits === "yes" && !a.onGoal).map((a) => a.id),
      remove: verdicts.filter((a) => a.fits === "no" && a.onGoal).map((a) => a.id),
      judged: verdicts.length,
    }
  },
})

export const goalsActions = { evaluate }
