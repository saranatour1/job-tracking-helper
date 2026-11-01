"use node"
import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { experimental_decide as decide } from "ai"
import { ConvexError } from "convex/values"
import { extractText } from "unpdf"
import { internal } from "../../_generated/api"
import { action } from "../../_generated/server"
import { arkOutputToConvex } from "../../lib/ark"
import { memberId } from "../../lib/functions"
import { type NoulAnswer, readNoul } from "../../lib/jev"
import { jevModel } from "../workflows/judge"
import { limits as rates } from "../workflows/manager"
import {
  checksOf,
  contactOf,
  maxResumeChars,
  sectionsOf,
  suggestionsFrom,
  wordsOf,
  type WritingAnswers,
  writingQuestions,
  maxJevChars,
  maxTags,
} from "./resumeRules"
import { Review } from "./validators"

const review = action({
  args: {},
  returns: arkOutputToConvex(Review),
  handler: async (ctx): Promise<Review> => {
    const userId = await memberId(ctx)
    if (!userId) throw new Error("Not signed in")
    const { ok } = await rates.limit(ctx, "resumeReview", { key: userId })
    if (!ok) throw new ConvexError("That's 10 reviews today. Try again tomorrow.")
    const found = await ctx.runQuery(internal.api.preferences.resumeToReview, { userId })
    if (!found) throw new ConvexError("Upload a resume first.")
    const file = await ctx.storage.get(found.resumeId)
    if (!file) throw new ConvexError("The resume file is gone. Upload it again.")

    let text: string
    if (found.contentType === "application/pdf")
      text = (await extractText(new Uint8Array(await file.arrayBuffer()), { mergePages: true }))
        .text
    else if (found.contentType === "text/plain") text = await file.text()
    else throw new ConvexError("Reviews read PDF and plain text files. Export it as a PDF.")
    text = text.replace(/\r/g, "").slice(0, maxResumeChars)
    if (wordsOf(text) < 20)
      throw new ConvexError("No text came out of that file. If it's a scan, export it as text.")

    const tags = [...found.skills, ...found.interests].slice(0, maxTags)
    const questions = {
      ...Object.fromEntries(
        Object.entries(writingQuestions).map(([key, instructions]) => [
          key,
          { type: "boolean" as const, instructions },
        ])
      ),
      ...Object.fromEntries(
        tags.map((tag, i) => [
          `t${i}`,
          {
            type: "boolean" as const,
            instructions: `Does the resume show experience with, or clear knowledge of, “${tag}”?`,
          },
        ])
      ),
    }
    const result = await decide({
      model: convexGateway.evaluationModel(jevModel),
      state: { resume: text.slice(0, maxJevChars) },
      questions,
    }).catch((cause: unknown) => {
      console.error("preferences:review", cause instanceof Error ? cause.message : cause)
      return null
    })
    const answers = (result?.answers ?? {}) as Record<string, NoulAnswer>
    const writing: WritingAnswers = result
      ? Object.fromEntries(
          Object.keys(writingQuestions)
            .map((key) => [key, readNoul(answers[key])] as const)
            .filter(([, read]) => read !== "unsure")
            .map(([key, read]) => [key, read === "yes"])
        )
      : {}
    const shows = result ? tags.map((tag, i) => ({ tag, shown: readNoul(answers[`t${i}`]) })) : []

    const reviewed: Review = {
      at: Date.now(),
      contact: contactOf(text),
      sections: sectionsOf(text),
      checks: checksOf(text),
      suggestions: suggestionsFrom(writing, shows),
      shows,
      words: wordsOf(text),
      ...(!result && {
        note: "Jev couldn't read it just now, so this is the ATS check alone. Review again later for suggestions.",
      }),
    }
    await ctx.runMutation(internal.api.preferences.setResumeReview, {
      userId,
      text,
      review: reviewed,
    })
    return reviewed
  },
})

export const resumeActions = { review }
