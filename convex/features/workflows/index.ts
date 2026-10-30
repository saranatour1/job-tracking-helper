import { actionsApi } from "./actions"
import { workflowApi } from "./findJobs"

export const workflowsApi = { ...workflowApi, ...actionsApi }
