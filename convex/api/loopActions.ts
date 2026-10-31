// Apart from api/loops so its reads don't load the AI SDK and the HTML parser on every run.
import { linkApi } from "../features/loops/link"

export const { checkLink, checkLinkFor, enrichApplication } = linkApi
