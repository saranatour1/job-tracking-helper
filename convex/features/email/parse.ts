import PostalMime from "postal-mime"
import { cap } from "./utils"
import type { Received } from "./validators"

/** A raw email as the app keeps it. The envelope, when there is one, beats the headers. */
export const parseMail = async (
  raw: string | ArrayBuffer,
  envelope: { from?: string | null; to?: string | null } = {}
): Promise<typeof Received.infer> => {
  const mail = await PostalMime.parse(raw)
  return {
    from: mail.from?.address || envelope.from || "",
    fromName: mail.from?.name || undefined,
    // The envelope says which of the person's addresses got it; the To header is a fallback.
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
