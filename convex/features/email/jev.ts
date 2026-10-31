import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { experimental_decide as decide } from "ai"
import { jevModel } from "../workflows/judge"
import { type Candidate, type Kind, kindLabels, kinds } from "./match"
import type { Received } from "./validators"

export const askJev = async (
  mail: typeof Received.infer,
  applications: Candidate[]
): Promise<{ application?: Candidate; kind: Kind; sureOfKind: number }> => {
  const options = Object.fromEntries(
    applications.map((a, i) => [`a${i}`, `${a.company}: ${a.role}`])
  )
  const result = await decide({
    model: convexGateway.evaluationModel(jevModel),
    state: {
      email: {
        from: mail.fromName ? `${mail.fromName} <${mail.from}>` : mail.from,
        subject: mail.subject,
        text: (mail.text ?? "").slice(0, 4000),
      },
      applications: Object.values(options),
    },
    questions: {
      application: {
        type: "choice",
        instructions:
          "Which of `applications` (company: role) is `email` about? Pick the one the email names or clearly refers to, or none when it's about none of them.",
        criteria: { ...options, none: "None of these" },
      },
      kind: {
        type: "choice",
        instructions: "What does `email` tell the person about their job application?",
        criteria: kindLabels,
      },
    },
  })
  const answers = result.answers as Record<
    string,
    { choice?: string; probabilities?: Record<string, number> }
  >
  const sure = (a?: { choice?: string; probabilities?: Record<string, number> }) =>
    a?.choice && (a.probabilities?.[a.choice] ?? 0) >= 0.5 ? a.choice : undefined
  const picked = sure(answers.application)
  const kind = sure(answers.kind)
  return {
    application: picked?.startsWith("a") ? applications[Number(picked.slice(1))] : undefined,
    kind: kinds.find((k) => k === kind) ?? "other",
    sureOfKind: kind ? (answers.kind?.probabilities?.[kind] ?? 0) : 0,
  }
}
