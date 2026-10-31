import { goalsActions } from "../features/goals/actions"
import { goalsApi } from "../features/goals/public"

export const { list, create, update, remove, retry, toEvaluate } = goalsApi
export const { evaluate } = goalsActions
