import { engineApi } from "../features/automations/engine"
import { publicApi } from "../features/automations/public"

export const { list, counts, choices, runs, save, setActive, remove, runNow, stopRun } = publicApi
export const {
  run,
  runPath,
  decisionOf,
  answered,
  foundRoles,
  firstLoopOf,
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
