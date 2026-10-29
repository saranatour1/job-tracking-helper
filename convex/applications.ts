// Registers `api.applications.*`. Definitions live in ./api/features/applications.
import { applicationsApi } from "./api/features/applications"

export const {
  list,
  add,
  update,
  setStatus,
  addNote,
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
