// Registers `api.applications.*`. Definitions live in ./api/features/applications.
import { applicationsApi } from "./api/features/applications"

export const { list, add } = applicationsApi
