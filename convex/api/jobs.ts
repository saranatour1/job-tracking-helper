import { jobsApi } from "../features/jobs"

export const {
  search,
  stats,
  companies,
  refreshDue,
  board,
  addBoards,
  ensureBoard,
  hasBoard,
  saveJobs,
  boardFetched,
  candidates,
  byUrlKey,
  get,
  fetchBoard,
} = jobsApi
