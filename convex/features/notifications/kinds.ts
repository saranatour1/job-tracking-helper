// What can reach someone's inbox. Safe to import from the frontend: Account lists these
// as switches, all on until turned off.
import type { Kind } from "../email/match"

export const notificationKinds = {
  "mail.news": {
    label: "Interview invites and offers",
    description: "When a company asks you to interview or makes you an offer.",
  },
  "mail.rejection": {
    label: "Rejections",
    description: "When a company isn't moving forward with your application.",
  },
  "mail.update": {
    label: "Other company mail",
    description: "Confirmations, portal updates and anything else filed under an application.",
  },
  "mail.unsorted": {
    label: "Mail that needs filing",
    description: "When an email doesn't match any of your applications.",
  },
  "booking.new": {
    label: "New bookings",
    description: "When someone books time on one of your booking pages.",
  },
  "automation.notify": {
    label: "Messages from your workflows",
    description: "When a workflow's Notify me step runs.",
  },
  "loop.found": {
    label: "New roles from loops",
    description: "When a morning run puts new roles on your shortlist.",
  },
  "apply.done": {
    label: "Applications sent for you",
    description: "When auto-apply submits an application.",
  },
  "apply.needsYou": {
    label: "Applications that need you",
    description:
      "When auto-apply stops because a question has no saved answer, or the form needs a login.",
  },
} as const
export type NotificationKind = keyof typeof notificationKinds
export const notificationKindKeys = Object.keys(notificationKinds) as NotificationKind[]

export const mailNotificationKind = (kind: Kind, filed: boolean): NotificationKind =>
  !filed
    ? "mail.unsorted"
    : kind === "interview" || kind === "offer"
      ? "mail.news"
      : kind === "rejection"
        ? "mail.rejection"
        : "mail.update"
