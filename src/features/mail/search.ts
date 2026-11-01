export const views = ["inbox", "sent", "drafts", "archived", "trash", "templates"] as const
export type View = (typeof views)[number]

export type MailSearch = {
  view?: View
  label?: string
  open?: string
  // Another email in the open email's thread, when you've picked one.
  message?: string
  // "new", or a draft's id.
  compose?: string
  // The email being answered.
  reply?: string
  // "new", or a template's id.
  template?: string
}

const stringOf = (value: unknown) => (typeof value === "string" && value ? value : undefined)

export const mailSearch = (search: Record<string, unknown>): MailSearch => {
  const view = views.find((v) => v === search.view)
  const [label, open, message, compose, reply, template] = [
    stringOf(search.label),
    stringOf(search.open),
    stringOf(search.message),
    stringOf(search.compose),
    stringOf(search.reply),
    stringOf(search.template),
  ]
  return {
    ...(view && { view }),
    ...(label && { label }),
    ...(open && { open }),
    ...(message && { message }),
    ...(compose && { compose }),
    ...(reply && { reply }),
    ...(template && { template }),
  }
}
