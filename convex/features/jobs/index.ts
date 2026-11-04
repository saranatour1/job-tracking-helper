import { actionsApi } from "./actions"
import { internalApi } from "./internal"
import { publicApi } from "./public"
import { summariesApi } from "./summaries"
import { trendsApi } from "./trends"

export const jobsApi = {
  ...publicApi,
  ...internalApi,
  ...actionsApi,
  ...trendsApi,
  ...summariesApi,
}
