import { internalApi } from "./internal"
import { linkApi } from "./link"
import { publicApi } from "./public"

export const loopsApi = { ...publicApi, ...internalApi, ...linkApi }
