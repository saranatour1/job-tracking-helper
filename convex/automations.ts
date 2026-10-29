// Registers `api.automations.*` and `internal.automations.*`: workflows people build
// from blocks, and the one workflow that runs them. Definitions live in
// ./api/features/automations.
import { actionsApi } from "./api/features/automations/actions"
import { engineApi } from "./api/features/automations/engine"
import { publicApi } from "./api/features/automations/public"

export const { list, counts, choices, runs, save, setActive, remove, runNow, stopRun } = publicApi
export const {
  run,
  runPath,
  decisionOf,
  answered,
  foundRoles,
  emailOf,
  emailed,
  onEvent,
  forgetWorkflow,
  shapeOf,
  runStep,
  startBranch,
  finishStep,
  ended,
  startDue,
} = engineApi
export const { askJev, sendMail } = actionsApi
