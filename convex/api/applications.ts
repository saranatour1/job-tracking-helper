// Registers `api.api.applications.*`. Definitions live in ../features/applications.
import { applicationsApi } from "../features/applications"

export const {
  list,
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
  emptyTrashFor,
  setTrashDays,
  trashSettings,
  sweep,
} = applicationsApi
