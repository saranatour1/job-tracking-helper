import { type } from "arktype"
import { arkId } from "../../lib/ark"

// One big delete waiting for the batch worker. `before` is when it was asked for: an account
// goes only up to then, and a sweep only takes what was already due.
export const DeleteJob = type({
  kind: "'account' | 'trash' | 'expiredTrash' | 'oldActivity'",
  "userId?": arkId("users"),
  before: "number",
  // How far through an account's tables it is.
  step: "number",
})
export type DeleteJob = typeof DeleteJob.infer
