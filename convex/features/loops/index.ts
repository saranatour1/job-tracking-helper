import { internalApi } from "./internal"
import { judgedApi } from "./judged"
import { publicApi } from "./public"

export const loopsApi = { ...publicApi, ...internalApi, ...judgedApi }
