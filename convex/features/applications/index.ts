import { publicApi } from "./public"
import { trashApi } from "./trash"

export const applicationsApi = { ...publicApi, ...trashApi }
