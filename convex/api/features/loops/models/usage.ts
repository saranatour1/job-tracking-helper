import { defineTable } from "convex/server"
import { type } from "arktype"
import { arkOutputToConvex } from "../../../../lib/ark"
import { providerIds } from "../validators"

// Credits each source has used this month, shared by everyone. `exhaustedAt` is set
// when the source said it was out, so runs skip it until the month changes.
export const SourceUsage = type({
  provider: type.enumerated(...providerIds),
  month: "string",
  used: "number",
  "exhaustedAt?": "number",
})

export const sourceUsageTable = defineTable(arkOutputToConvex(SourceUsage)).index(
  "by_provider_and_month",
  ["provider", "month"]
)
