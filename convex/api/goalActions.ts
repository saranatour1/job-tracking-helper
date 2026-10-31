// Apart from api/goals so its reads don't load the AI SDK on every run.
import { goalsActions } from "../features/goals/actions"

export const { evaluate } = goalsActions
