// Registers `internal.workflows.*`: the find-jobs workflow and its batch actions.
// Definitions live in ./features/workflows.
import { workflowsApi } from "./features/workflows"

export const { findJobs, search, judgeOne } = workflowsApi
