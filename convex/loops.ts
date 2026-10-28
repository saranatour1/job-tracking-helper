// Registers `api.loops.*` and `internal.loops.*`. Definitions live in ./api/features/loops.
import { loopsApi } from "./api/features/loops"

export const {
  list,
  create,
  setActive,
  remove,
  runNow,
  runs,
  leads,
  setLeadStatus,
  sourceStatus,
  startDue,
  beginRun,
  unseen,
  queueReads,
  readDone,
  finishRun,
  runEnded,
} = loopsApi
