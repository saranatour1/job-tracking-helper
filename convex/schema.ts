import { defineSchema } from "convex/server"
import { applicationsTable } from "./api/features/applications/models"
import {
  jobLeadsTable,
  loopRunsTable,
  loopsTable,
  sourceUsageTable,
} from "./api/features/loops/models"
import {
  preferencesTable,
  preferenceTagsTable,
  profileEntriesTable,
} from "./api/features/preferences/models"
import { usersTable } from "./api/features/users/models"

export default defineSchema({
  users: usersTable,
  applications: applicationsTable,
  preferences: preferencesTable,
  preferenceTags: preferenceTagsTable,
  profileEntries: profileEntriesTable,
  loops: loopsTable,
  loopRuns: loopRunsTable,
  jobLeads: jobLeadsTable,
  sourceUsage: sourceUsageTable,
})
