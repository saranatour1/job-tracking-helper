// Registers `api.jobs.*` and `internal.jobs.*`. Definitions live in ./api/features/jobs.
import { jobsApi } from "./api/features/jobs"

export const {
  search,
  stats,
  refreshDue,
  board,
  addBoards,
  ensureBoard,
  saveJobs,
  boardFetched,
  candidates,
  byUrlKey,
  get,
  fetchBoard,
} = jobsApi
