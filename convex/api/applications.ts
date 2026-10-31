// Registers `api.api.applications.*`. Definitions live in ../features/applications.
import { applicationsApi } from "../features/applications"

export const {
  list,
  get,
  numberOf,
  add,
  update,
  setStatus,
  addNote,
  setGoal,
  trashed,
  archive,
  trash,
  restore,
  deleteForever,
  emptyTrash,
  setTrashDays,
  trashSettings,
  sweep,
} = applicationsApi
