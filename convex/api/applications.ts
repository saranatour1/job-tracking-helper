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
  setTrashDays,
  trashSettings,
  sweep,
} = applicationsApi
