// Registers `api.mailbox.*` and `internal.mailbox.*`. Definitions live in ./features/mailbox.
import { mailboxApi } from "./features/mailbox/public"

export const {
  page,
  content,
  thread,
  markRead,
  move,
  deleteForever,
  setLabels,
  labels,
  drafts,
  draft,
  storeDraft,
  saveDraft,
  deleteDraft,
  draftsPage,
  resealDraft,
  templates,
  saveTemplate,
  removeTemplate,
} = mailboxApi
