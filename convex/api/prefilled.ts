// Registers `api.api.prefilled.*` and `internal.api.prefilled.*`. Definitions live in
// ../features/prefilled.
import { prefilledApi } from "../features/prefilled"

export const {
  settings,
  setAutoPrepare,
  prepare,
  prepareAgain,
  dismiss,
  setAnswer,
  list,
  get,
  plan,
  savePrepared,
  fail,
  ended,
  beginLive,
  goLive,
  endLive,
  finish,
  session,
  sent,
  prepareForm,
  startLive,
  sendToForm,
  confirmSent,
  cancelLive,
  closeLive,
} = prefilledApi
