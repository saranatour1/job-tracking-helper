import { inboundApi } from "./inbound"
import { internalApi } from "./internal"
import { publicApi } from "./public"
import { sendApi } from "./send"
import { sortApi } from "./sort"

export const emailApi = { ...publicApi, ...inboundApi, ...sortApi, ...sendApi, ...internalApi }
