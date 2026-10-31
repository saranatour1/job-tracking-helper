// Apart from api/email so its reads don't load the AI SDK on every run.
import { sortActions } from "../features/email/sortMail"

export const { sortMail } = sortActions
