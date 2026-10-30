import { defineSchema } from "convex/server"
import { applicationsTable } from "./features/applications/models"
import { autoAppliesTable } from "./features/autoApply/models"
import { automationRunsTable, automationsTable } from "./features/automations/models"
import { bookingPagesTable } from "./features/booking/models"
import { calendarEventsTable, calendarSettingsTable } from "./features/calendar/models"
import { emailConnectionsTable, mailEventsTable } from "./features/email/models"
import { goalsTable } from "./features/goals/models"
import { jobBoardsTable, jobsTable } from "./features/jobs/models"
import { jobLeadsTable, loopRunsTable, loopsTable, sourceUsageTable } from "./features/loops/models"
import {
  preferencesTable,
  preferenceTagsTable,
  profileEntriesTable,
} from "./features/preferences/models"
import { usersTable } from "./features/users/models"
import { viewsTable } from "./features/views/models"

export default defineSchema({
  users: usersTable,
  applications: applicationsTable,
  autoApplies: autoAppliesTable,
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
  goals: goalsTable,
  calendarEvents: calendarEventsTable,
  calendarSettings: calendarSettingsTable,
  bookingPages: bookingPagesTable,
  automations: automationsTable,
  automationRuns: automationRunsTable,
})
