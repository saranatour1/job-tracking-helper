import { internalApi } from "./internal"
import { publicApi } from "./public"

export const prefilledApi = { ...publicApi, ...internalApi }
