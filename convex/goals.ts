// Registers `api.goals.*`. Definitions live in ./api/features/goals.
import { goalsApi } from "./api/features/goals/public"

export const { list, create, update, remove } = goalsApi
