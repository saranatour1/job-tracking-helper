import { env } from "../../../../_generated/server"
import type { Provider } from "../../loops/catalog"
import { contextDev } from "./contextDev"
import { firecrawl } from "./firecrawl"
import type { Source } from "./source"

export const sources: Record<Provider, Source> = { firecrawl, contextDev }

export const apiKeyOf = (provider: Provider) =>
  provider === "firecrawl" ? env.FIRECRAWL_API_KEY : env.CONTEXT_DEV_API_KEY

// Each plan's monthly credits: set in the Convex env, or the free plan's.
const freePlan: Record<Provider, number> = { firecrawl: 500, contextDev: 1000 }
export const monthlyCredits = (provider: Provider) =>
  Number(
    provider === "firecrawl" ? env.FIRECRAWL_MONTHLY_CREDITS : env.CONTEXT_DEV_MONTHLY_CREDITS
  ) || freePlan[provider]

// Usage resets each calendar month (UTC), close enough to the sources' billing months.
export const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7)
