// Registers `api.views.*`. Definitions live in ./features/views.
import { viewsApi } from "./features/views/public"

export const { list, create, remove } = viewsApi
