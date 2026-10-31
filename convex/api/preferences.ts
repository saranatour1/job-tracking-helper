import { preferencesApi } from "../features/preferences"

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
