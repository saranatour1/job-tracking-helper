// Registers `api.activity.*` and `internal.activity.*`. Definitions live in ./features/activity.
import { activityApi } from "./features/activity/public"

export const { page, record, failures, sweep } = activityApi
