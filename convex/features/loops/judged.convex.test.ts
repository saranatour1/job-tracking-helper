// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import batchWorker from "@convex-dev/batch-worker/test"
import type { WorkId } from "@convex-dev/workpool"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import schema from "../../schema"

const modules = import.meta.glob([
  "../../**/*.ts",
  "!../../components/notifications/**",
  "!../../components/cloudflareEmail/**",
  "!../../**/*.test.ts",
])

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const setup = async (readsLeft: number | undefined) => {
  const t = convexTest(schema, modules)
  batchWorker.register(t)
  const runId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Sam" })
    const loopId = await ctx.db.insert("loops", {
      userId,
      name: "Mine",
      template: "blank",
      answers: {
        usePreferences: false,
        stretch: false,
        remoteOnly: false,
        nearMe: false,
        listedCompanies: false,
        skipRedFlags: false,
        postedToday: false,
      },
      prompt: "",
      daily: 10,
      show: 3,
      at: "08:00",
      timeZone: "UTC",
      active: true,
      nextRunAt: 1,
    })
    return ctx.db.insert("loopRuns", {
      userId,
      loopId,
      loopName: "Mine",
      status: "running",
      scanned: 0,
      kept: 0,
      saved: 0,
      applied: 0,
      credits: 0,
      startedAt: 1,
      candidates: [],
      cost: 0,
      readFailures: 0,
      ...(readsLeft !== undefined && { readsLeft }),
    })
  })
  return { t, runId }
}

const failure = (runId: Id<"loopRuns">) => ({
  workId: "w" as WorkId,
  context: { runId },
  result: { kind: "failed" as const, error: "No" },
})

describe("finished judgments", () => {
  it("all reach the run when they finish together, and leave no rows behind", async () => {
    const { t, runId } = await setup(60)
    await Promise.all(
      Array.from({ length: 60 }, () => t.mutation(internal.api.loops.judged, failure(runId)))
    )
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const run = await t.run((ctx) => ctx.db.get("loopRuns", runId))
    expect(run).toMatchObject({ readsLeft: 0, readFailures: 60 })
    expect(await t.run((ctx) => ctx.db.query("judgedReads").collect())).toEqual([])
  })

  it("are dropped for a run that was stopped", async () => {
    const { t, runId } = await setup(undefined)
    await t.mutation(internal.api.loops.judged, failure(runId))
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect((await t.run((ctx) => ctx.db.get("loopRuns", runId)))?.readFailures).toBe(0)
    expect(await t.run((ctx) => ctx.db.query("judgedReads").collect())).toEqual([])
  })
})
