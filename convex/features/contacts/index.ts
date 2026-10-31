import { internalApi } from "./internal"
import { publicApi } from "./public"

export const contactsApi = { ...publicApi, ...internalApi }
