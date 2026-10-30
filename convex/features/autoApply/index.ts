import { actionsApi } from "./actions"
import { internalApi } from "./internal"
import { publicApi } from "./public"

export const autoApplyApi = { ...publicApi, ...internalApi, ...actionsApi }
