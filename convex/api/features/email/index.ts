import { inboundApi } from "./inbound"
import { internalApi } from "./internal"
import { publicApi } from "./public"
import { sortApi } from "./sort"

export const emailApi = { ...publicApi, ...inboundApi, ...sortApi, ...internalApi }
