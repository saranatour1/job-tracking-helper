import type { Provider } from "@convex/api/features/loops/catalog"

// Sample data for the Loops preview. Nothing here is stored yet; the tables in
// docs/database-design.md replace it.

export type SampleLoop = {
  id: string
  template: string
  name: string
  active: boolean
  daily: number
  at: string
}

export type Run = {
  id: string
  loopId: string
  day: string
  provider: Provider | undefined
  scanned: number
  kept: number
  saved: number
  applied: number
  credits: number
  seconds: number
  status: "done" | "failed" | "skipped"
  note?: string
}

export const sampleLoops: SampleLoop[] = [
  {
    id: "loop-1",
    template: "remote-fit",
    name: "Remote roles that fit",
    active: true,
    daily: 10,
    at: "08:00",
  },
  {
    id: "loop-2",
    template: "dream-companies",
    name: "Dream companies watch",
    active: true,
    daily: 5,
    at: "07:00",
  },
]

const run = (
  id: string,
  loopId: string,
  day: string,
  provider: Provider | undefined,
  [scanned, kept, saved, applied]: number[],
  credits: number,
  seconds: number,
  status: Run["status"] = "done",
  note?: string
): Run => ({
  id,
  loopId,
  day,
  provider,
  scanned: scanned!,
  kept: kept!,
  saved: saved!,
  applied: applied!,
  credits,
  seconds,
  status,
  note,
})

// Newest first.
export const sampleRuns: Run[] = [
  run("r-14", "loop-1", "2026-10-28", "firecrawl", [30, 9, 3, 1], 33, 74),
  run("r-13", "loop-2", "2026-10-28", "firecrawl", [15, 2, 2, 1], 17, 41),
  run("r-12", "loop-1", "2026-10-27", "firecrawl", [30, 7, 2, 0], 33, 69),
  run("r-11", "loop-2", "2026-10-27", "firecrawl", [15, 0, 0, 0], 17, 38),
  run("r-10", "loop-1", "2026-10-26", "contextDev", [30, 8, 1, 0], 33, 81),
  run(
    "r-09",
    "loop-2",
    "2026-10-26",
    undefined,
    [0, 0, 0, 0],
    0,
    2,
    "skipped",
    "Both sources were out of credits for the hour."
  ),
  run("r-08", "loop-1", "2026-10-25", "contextDev", [30, 10, 4, 2], 33, 77),
  run("r-07", "loop-2", "2026-10-25", "contextDev", [15, 1, 1, 0], 17, 40),
  run(
    "r-06",
    "loop-1",
    "2026-10-24",
    "firecrawl",
    [12, 3, 0, 0],
    14,
    120,
    "failed",
    "Firecrawl timed out after 12 postings; kept what it had."
  ),
  run("r-04", "loop-1", "2026-10-23", "firecrawl", [30, 6, 2, 1], 33, 70),
  run("r-03", "loop-2", "2026-10-23", "firecrawl", [15, 3, 2, 1], 17, 39),
]

// This month's credits per source. Firecrawl goes first; context.dev takes over when it
// runs low.
export const providerUsage: Record<Provider, { used: number; limit: number; resets: string }> = {
  firecrawl: { used: 2310, limit: 3000, resets: "Nov 1" },
  contextDev: { used: 140, limit: 1000, resets: "Nov 1" },
}
