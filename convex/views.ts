// Registers `api.views.*`. Definitions live in ./api/features/views.
import { viewsApi } from "./api/features/views/public"

export const { list, create, remove } = viewsApi
