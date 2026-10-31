// Registers `api.api.goals.*`. Definitions live in ../features/goals.
import { goalsActions } from "../features/goals/actions"
import { goalsApi } from "../features/goals/public"

export const { list, activity, create, update, remove, retry, toEvaluate } = goalsApi
export const { evaluate } = goalsActions
