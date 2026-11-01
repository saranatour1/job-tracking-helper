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
  "automation.notify": {
    label: "Messages from your workflows",
    description: "When a workflow's Notify me step runs.",
  },
  "loop.found": {
    label: "New roles from loops",
    description: "When a morning run puts new roles on your shortlist.",
  },
  "prefill.ready": {
    label: "Applications ready for you",
    description: "When an application is prepared and waiting for you to check and send it.",
  },
  "agent.message": {
    label: "Messages from connected agents",
    description: "When an AI agent you connected under Connected agents writes to you.",
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
