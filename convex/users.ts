// Public module: Convex registers what this file exports as `internal.users.*`.
// Definitions live in ./features/users.
import { usersApi } from "./features/users/create"

export const { createUser } = usersApi
