import { jobsApi } from "../features/jobs"

export const {
  search,
  stats,
  companies,
  refreshDue,
  board,
  addBoards,
  addSearches,
  ensureBoard,
  hasBoard,
  saveJobs,
  boardFetched,
  candidates,
  byUrlKey,
  get,
  fetchBoard,
} = jobsApi
