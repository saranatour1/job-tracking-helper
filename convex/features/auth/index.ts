import { internalApi } from "./internal"
import { publicApi } from "./public"

export const authApi = { ...publicApi, ...internalApi }
