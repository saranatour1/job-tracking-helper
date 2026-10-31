// Registers `api.api.mailbox.*` and `internal.api.mailbox.*`. Definitions live in ../features/mailbox.
import { mailboxApi } from "../features/mailbox/public"

export const {
  page,
  content,
  thread,
  unreadCount,
  markRead,
  markUnread,
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
