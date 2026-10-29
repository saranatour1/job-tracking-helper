import { defineSchema } from "convex/server"
import { applicationsTable } from "./api/features/applications/models"
import { automationRunsTable, automationsTable } from "./api/features/automations/models"
import { bookingPagesTable } from "./api/features/booking/models"
import { calendarEventsTable, calendarSettingsTable } from "./api/features/calendar/models"
import { emailConnectionsTable, mailEventsTable } from "./api/features/email/models"
import { jobBoardsTable, jobsTable } from "./api/features/jobs/models"
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
import { viewsTable } from "./api/features/views/models"

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
  jobs: jobsTable,
  jobBoards: jobBoardsTable,
  emailConnections: emailConnectionsTable,
  mailEvents: mailEventsTable,
  views: viewsTable,
  calendarEvents: calendarEventsTable,
  calendarSettings: calendarSettingsTable,
  bookingPages: bookingPagesTable,
  automations: automationsTable,
  automationRuns: automationRunsTable,
})
