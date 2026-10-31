import PostalMime from "postal-mime"
import { cap } from "./utils"
import type { Received } from "./validators"

export const parseMail = async (
  raw: string | ArrayBuffer,
  envelope: { from?: string | null; to?: string | null } = {}
): Promise<typeof Received.infer> => {
  const mail = await PostalMime.parse(raw)
  return {
    from: mail.from?.address || envelope.from || "",
    fromName: mail.from?.name || undefined,
    to: [envelope.to || mail.to?.flatMap((a) => (a.address ? [a.address] : [])).join(", ") || ""],
    subject: cap(mail.subject, 500) ?? "",
    // Sized so a sealed message stays well under Convex's 1 MiB document limit.
    text: cap(mail.text, 100_000),
    html: cap(mail.html, 300_000),
    messageId: mail.messageId,
    inReplyTo: mail.inReplyTo,
    references: mail.references,
    date: mail.date,
    attachments: mail.attachments.flatMap((a) => (a.filename ? [a.filename] : [])),
  }
}
