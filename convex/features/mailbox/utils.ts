import type { Id } from "../../_generated/dataModel"

export const draftAad = (userId: string) => `mail-draft:${userId}`

export const threadSubject = (subject: string) =>
  subject
    .replace(/^\s*((re|fwd?|aw)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase()

type ThreadEmail = {
  subject: string
  sent: boolean
  from: string
  to?: string
  applicationId?: Id<"applications">
}

const otherSide = (mail: ThreadEmail) => (mail.sent ? mail.to : mail.from)?.toLowerCase()

export const sameThread = (a: ThreadEmail, b: ThreadEmail) =>
  threadSubject(a.subject) === threadSubject(b.subject) &&
  a.applicationId === b.applicationId &&
  (a.applicationId !== undefined || otherSide(a) === otherSide(b))
