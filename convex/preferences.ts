// Registers `api.preferences.*`. Definitions live in ./features/preferences.
import { preferencesApi } from "./features/preferences"

export const {
  get,
  tags,
  entries,
  save,
  savePrefilled,
  skip,
  setResume,
  resumeToReview,
  setResumeReview,
} = preferencesApi
