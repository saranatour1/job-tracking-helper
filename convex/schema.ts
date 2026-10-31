import { defineSchema } from "convex/server"
import { applicationsTable } from "./features/applications/models"
import { activityEventsTable } from "./features/activity/models"
import { deleteJobsTable } from "./features/deletes/models"
import { automationRunsTable, automationsTable } from "./features/automations/models"
import { bookingPagesTable } from "./features/booking/models"
import { calendarEventsTable, calendarSettingsTable } from "./features/calendar/models"
import { contactsTable } from "./features/contacts/models"
import { emailConnectionsTable, mailEventsTable } from "./features/email/models"
import {
  mailDraftsTable,
  mailEventLabelsTable,
  mailLabelsTable,
  mailTemplatesTable,
} from "./features/mailbox/models"
import { goalsTable } from "./features/goals/models"
import { jobBoardsTable, jobCatalogTable, jobsTable } from "./features/jobs/models"
import { jobLeadsTable, loopRunsTable, loopsTable, sourceUsageTable } from "./features/loops/models"
import {
  preferencesTable,
  preferenceTagsTable,
  profileEntriesTable,
} from "./features/preferences/models"
import { prefillsTable } from "./features/prefilled/models"
import { usersTable } from "./features/users/models"
import { viewsTable } from "./features/views/models"

// Grouped by what they're about. docs/database-design.md has how they point at each other,
// and what happens to each when what it points at is deleted.
export default defineSchema({
  // Who you are, and what you want.
  users: usersTable,
  preferences: preferencesTable,
  preferenceTags: preferenceTagsTable,
  profileEntries: profileEntriesTable,

  // Your search: what you've applied to, how you group it, and what you're aiming for.
  applications: applicationsTable,
  goals: goalsTable,
  views: viewsTable,

  // Open roles, shared by everyone.
  jobBoards: jobBoardsTable,
  jobCatalog: jobCatalogTable,
  jobs: jobsTable,
  sourceUsage: sourceUsageTable,

  // Finding roles that fit you, and making them ready to send.
  loops: loopsTable,
  loopRuns: loopRunsTable,
  jobLeads: jobLeadsTable,
  prefills: prefillsTable,

  // Mail.
  emailConnections: emailConnectionsTable,
  mailEvents: mailEventsTable,
  contacts: contactsTable,
  mailLabels: mailLabelsTable,
  mailEventLabels: mailEventLabelsTable,
  mailDrafts: mailDraftsTable,
  mailTemplates: mailTemplatesTable,

  // Time.
  calendarEvents: calendarEventsTable,
  calendarSettings: calendarSettingsTable,
  bookingPages: bookingPagesTable,

  // Workflows you build.
  automations: automationsTable,
  automationRuns: automationRunsTable,

  // What happened for each person, kept from its evlog event.
  activityEvents: activityEventsTable,

  // Big deletes waiting for the batch worker.
  deleteJobs: deleteJobsTable,
})
