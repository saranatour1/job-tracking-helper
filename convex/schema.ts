import { defineSchema } from "convex/server"
import { applicationSendsTable, applicationsTable } from "./features/applications/models"
import { activityEventsTable } from "./features/activity/models"
import { deleteJobsTable } from "./features/deletes/models"
import { automationRunsTable, automationsTable } from "./features/automations/models"
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
import { companiesTable, jobBoardsTable, jobCatalogTable, jobsTable } from "./features/jobs/models"
import {
  jobLeadsTable,
  judgedReadsTable,
  loopRunsTable,
  loopsTable,
  sourceUsageTable,
} from "./features/loops/models"
import {
  preferencesTable,
  preferenceTagsTable,
  profileEntriesTable,
} from "./features/preferences/models"
import { prefillsTable } from "./features/prefilled/models"
import { usersTable } from "./features/users/models"
import { viewsTable } from "./features/views/models"

export default defineSchema({
  users: usersTable,
  preferences: preferencesTable,
  preferenceTags: preferenceTagsTable,
  profileEntries: profileEntriesTable,

  applications: applicationsTable,
  applicationSends: applicationSendsTable,
  goals: goalsTable,
  views: viewsTable,

  companies: companiesTable,
  jobBoards: jobBoardsTable,
  jobCatalog: jobCatalogTable,
  jobs: jobsTable,
  sourceUsage: sourceUsageTable,

  loops: loopsTable,
  loopRuns: loopRunsTable,
  jobLeads: jobLeadsTable,
  judgedReads: judgedReadsTable,
  prefills: prefillsTable,

  emailConnections: emailConnectionsTable,
  mailEvents: mailEventsTable,
  contacts: contactsTable,
  mailLabels: mailLabelsTable,
  mailEventLabels: mailEventLabelsTable,
  mailDrafts: mailDraftsTable,
  mailTemplates: mailTemplatesTable,

  calendarEvents: calendarEventsTable,
  calendarSettings: calendarSettingsTable,

  automations: automationsTable,
  automationRuns: automationRunsTable,

  activityEvents: activityEventsTable,

  deleteJobs: deleteJobsTable,
})
