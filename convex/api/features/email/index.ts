import { inboundApi } from "./inbound"
import { internalApi } from "./internal"
import { publicApi } from "./public"

export const emailApi = { ...publicApi, ...inboundApi, ...internalApi }
