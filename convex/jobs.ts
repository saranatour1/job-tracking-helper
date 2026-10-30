// Registers `api.jobs.*` and `internal.jobs.*`. Definitions live in ./features/jobs.
import { jobsApi } from "./features/jobs"

export const {
  search,
  stats,
  companies,
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
