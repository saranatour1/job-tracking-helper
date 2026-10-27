import { defineSchema } from "convex/server"
import { applicationsTable } from "./api/features/applications/models"
import { usersTable } from "./api/features/users/models"

export default defineSchema({
  users: usersTable,
  applications: applicationsTable,
})
