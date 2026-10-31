import { ping } from "@convex-dev/batch-worker"
import { components, internal } from "../../_generated/api"
import type { MutationCtx } from "../../_generated/server"
import type { DeleteJob } from "./validators"

export const workerName = "deletes"

/** Queues a big delete. Anything that can touch many rows goes through here, so it's done in
 * batches by one worker instead of risking a single mutation's limits. */
export const startDelete = async (ctx: MutationCtx, job: Omit<DeleteJob, "step">) => {
  await ctx.db.insert("deleteJobs", { ...job, step: 0 })
  await ping(ctx, components.batchWorker, {
    name: workerName,
    workQuery: internal.api.deletes.nextBatch,
    workerMutation: internal.api.deletes.deleteBatch,
  })
}
