// Registers `api.automations.*` and `internal.automations.*`: workflows people build
// from blocks, and the one workflow that runs them. Definitions live in
// ./api/features/automations.
import { engineApi } from "./api/features/automations/engine"
import { publicApi } from "./api/features/automations/public"

export const { list, counts, runs, save, setActive, remove, runNow, stopRun } = publicApi
export const {
  run,
  runPath,
  forgetWorkflow,
  shapeOf,
  runStep,
  startSplit,
  finishStep,
  ended,
  startDue,
} = engineApi
