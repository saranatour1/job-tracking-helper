// Registers `api.goals.*`. Definitions live in ./api/features/goals.
import { goalsActions } from "./api/features/goals/actions"
import { goalsApi } from "./api/features/goals/public"

export const { list, create, update, remove, retry, toEvaluate } = goalsApi
export const { evaluate } = goalsActions
