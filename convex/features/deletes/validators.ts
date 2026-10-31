import { type } from "arktype"
import { arkId } from "../../lib/ark"

export const DeleteJob = type({
  kind: "'account' | 'trash' | 'expiredTrash' | 'oldActivity'",
  "userId?": arkId("users"),
  before: "number",
  step: "number",
})
export type DeleteJob = typeof DeleteJob.infer
