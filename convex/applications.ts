// Public module: Convex registers what this file exports as `api.applications.*`.
// Definitions live in ./features/applications.
import { applicationsApi } from "./features/applications/functions"

export const { list, add } = applicationsApi
