// Registers `api.api.activity.*` and `internal.api.activity.*`. Definitions live in ../features/activity.
import { activityApi } from "../features/activity/public"

export const { page, joinedAt, record, failures, sweep } = activityApi
