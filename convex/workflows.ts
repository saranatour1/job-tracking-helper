// Registers `internal.workflows.*`: the find-jobs workflow and its batch actions.
// Definitions live in ./api/features/workflows.
import { workflowsApi } from "./api/features/workflows"

export const { findJobs, search, read } = workflowsApi
