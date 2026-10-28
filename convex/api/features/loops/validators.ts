import { type } from "arktype"
import { blankTemplate, dailySizes, loopTemplates, runTimes } from "./catalog"

const trimmed = type("string.trim")

// A loop's answers: exactly the catalog's questions, each yes or no.
export const LoopAnswers = type({
  usePreferences: "boolean",
  stretch: "boolean",
  remoteOnly: "boolean",
  nearMe: "boolean",
  listedCompanies: "boolean",
  skipRedFlags: "boolean",
  postedToday: "boolean",
})

export const providerIds = ["firecrawl", "contextDev"] as const
export const runStatuses = ["queued", "running", "done", "failed", "skipped", "stopped"] as const
export const leadStatuses = ["new", "saved", "dismissed", "applied"] as const

// What the setup screen sends to start a loop. Only the catalog's choices pass.
export const NewLoop = type({
  name: trimmed.to(type("0 < string <= 60").describe("1 to 60 characters")),
  template: type.enumerated(blankTemplate.id, ...loopTemplates.map((t) => t.id)),
  answers: LoopAnswers,
  daily: type.enumerated(...dailySizes),
  at: type.enumerated(...runTimes),
  timeZone: "0 < string <= 64",
  // Runs by itself every morning; when no, it runs only when the person presses Run now.
  auto: "boolean",
})
