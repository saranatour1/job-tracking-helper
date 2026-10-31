import { limits } from "./manager"
import {
  type Profile,
  type JudgedJob,
  jevModel,
  stateOf,
  questionsOf,
  checksOf,
  specsOf,
  type Outcome,
  verdictOf,
} from "./judge"
import { experimental_decide as decide } from "ai"
import { convexGateway } from "@convex-dev/ai-sdk-provider"

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const turn = async (
  ctx: Parameters<typeof limits.limit>[0],
  provider: "firecrawl" | "contextDev"
) => {
  const { retryAfter } = await limits.limit(ctx, provider, { reserve: true })
  if (retryAfter) await sleep(retryAfter)
}

export const judge = async (profile: Profile, job: JudgedJob) => {
  const result = await decide({
    model: convexGateway.evaluationModel(jevModel),
    state: stateOf(profile, job),
    questions: questionsOf(profile),
  })
  const answers = result.answers as Record<
    string,
    { score?: number; choice?: string; probabilities?: Record<string, number> }
  >
  const checks = checksOf(
    profile,
    job,
    specsOf(profile).map((_, i) => {
      const a = answers[`c${i}`]
      const outcome = (a?.choice ?? "unclear") as Outcome
      return { outcome, confidence: a?.probabilities?.[outcome] ?? 0 }
    })
  )
  return {
    cost: Number(result.providerMetadata?.convexGateway?.cost ?? 0),
    ...verdictOf(answers.match?.score ?? 0, checks, result.response.modelId ?? jevModel),
  }
}
