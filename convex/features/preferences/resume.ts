"use node"
import { getAuthUserId } from "@convex-dev/auth/server"
import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { experimental_decide as decide } from "ai"
import { ConvexError } from "convex/values"
import { extractText } from "unpdf"
import { internal } from "../../_generated/api"
import { action } from "../../_generated/server"
import { arkOutputToConvex } from "../../lib/ark"
import { type NoulAnswer, readNoul } from "../../lib/jev"
import { jevModel } from "../workflows/judge"
import { limits as rates } from "../workflows/manager"
import {
  checksOf,
  contactOf,
  maxResumeChars,
  Review,
  sectionsOf,
  suggestionsFrom,
  wordsOf,
  type WritingAnswers,
  writingQuestions,
} from "./resumeRules"

// Jev reads this much of the resume: the first two pages or so.
const maxJevChars = 8000
// Tags Jev checks the resume against, from the top of each list.
const maxTags = 12

/** Parses the resume (unpdf for PDFs), runs the ATS rules and asks Jev about the
 * writing and the person's tags, then keeps the result on their preferences. */
const review = action({
  args: {},
  returns: arkOutputToConvex(Review),
  handler: async (ctx): Promise<Review> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not signed in")
    const { ok } = await rates.limit(ctx, "resumeReview", { key: userId })
    if (!ok) throw new ConvexError("That's 10 reviews today. Try again tomorrow.")
    const found = await ctx.runQuery(internal.preferences.resumeToReview, { userId })
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
    // The rules still stand when Jev is down; the review says so.
    const result = await decide({
      model: convexGateway.evaluationModel(jevModel),
      state: { resume: text.slice(0, maxJevChars) },
      questions,
    }).catch((cause: unknown) => {
      console.error("preferences:review", cause instanceof Error ? cause.message : cause)
      return null
    })
    // Only a sure answer counts: a sure no becomes advice, an unsure one becomes nothing.
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
    await ctx.runMutation(internal.preferences.setResumeReview, { userId, text, review: reviewed })
    return reviewed
  },
})

export const resumeActions = { review }
