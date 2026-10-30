// Registers `api.autoApply.*` and `internal.autoApply.*`. Definitions live in
// ./features/autoApply.
import { autoApplyApi } from "./features/autoApply"

export const {
  settings,
  setSwitch,
  queue,
  retry,
  cancel,
  list,
  plan,
  claim,
  markSubmitting,
  finish,
  ended,
  run,
} = autoApplyApi
