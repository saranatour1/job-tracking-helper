// Apart from api/goals so its other reads don't load the mail validators on every run.
import { activityApi } from "../features/goals/activity"

export const { activity } = activityApi
