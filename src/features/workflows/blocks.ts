import { statusLabels } from "@convex/api/features/applications/validators"
import {
  type Block,
  blocksOf,
  type Branch,
  type Step,
  type Trigger,
} from "@convex/api/features/automations/validators"
import {
  AiBrain01Icon,
  Calendar03Icon,
  CalendarAdd01Icon,
  CalendarCheckIn01Icon,
  GitForkIcon,
  HourglassIcon,
  JobSearchIcon,
  Mail01Icon,
  MailSend01Icon,
  ArrowMoveUpRightIcon,
  NoteEditIcon,
  Notification03Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons"

import type { EventColor } from "@/components/kloq/lib/event-types"

type Icon = typeof PlayIcon

// What the builder knows about each block: how it's named, drawn and summed up on its
// card, and what a new one starts as. Colours are the Calendar's palette.
export const blocks = {
  notify: {
    label: "Notify me",
    group: "Tell me",
    hint: "A line in your Inbox",
    icon: Notification03Icon,
    color: "violet",
    make: (): Block => ({ kind: "notify", message: "{workflow.name} ran on {run.date}" }),
  },
  move: {
    label: "Move application",
    group: "Do",
    hint: "To another status",
    icon: ArrowMoveUpRightIcon,
    color: "emerald",
    make: (): Block => ({ kind: "move", to: "interviewing" }),
  },
  addEvent: {
    label: "Add calendar event",
    group: "Do",
    hint: "Some days later",
    icon: CalendarAdd01Icon,
    color: "rose",
    make: (): Block => ({
      kind: "addEvent",
      title: "Follow up",
      inDays: 3,
      at: "09:00",
      minutes: 30,
    }),
  },
  findRoles: {
    label: "Find roles",
    group: "Find",
    hint: "Run one of your loops",
    icon: JobSearchIcon,
    color: "amber",
    // A loop has to be picked; the builder says so before it saves.
    make: (): Block => ({ kind: "findRoles", loopId: "" as never }),
  },
  sendEmail: {
    label: "Send email",
    group: "Do",
    hint: "From your address",
    icon: MailSend01Icon,
    color: "blue",
    make: (): Block => ({
      kind: "sendEmail",
      to: "{email.from}",
      subject: "Re: {email.subject}",
      text: "",
    }),
  },
  addNote: {
    label: "Add note",
    group: "Do",
    hint: "On one application",
    icon: NoteEditIcon,
    color: "blue",
    // With no application picked, it goes on the one the trigger is about.
    make: (): Block => ({ kind: "addNote", text: "" }),
  },
  wait: {
    label: "Wait",
    group: "Wait",
    hint: "Then go on",
    icon: HourglassIcon,
    color: "amber",
    make: (): Block => ({ kind: "wait", minutes: 24 * 60 }),
  },
} satisfies Record<
  Block["kind"],
  {
    label: string
    group: string
    hint: string
    icon: Icon
    color: EventColor
    make: () => Block
  }
>

// The two kinds of branch: every path runs, or Jev picks one.
export const branches = {
  parallel: {
    label: "Split into paths",
    short: "Split",
    hint: "Run steps side by side",
    icon: GitForkIcon,
  },
  decide: {
    label: "Ask Jev",
    short: "Ask Jev",
    hint: "Jev picks a path",
    icon: AiBrain01Icon,
  },
} satisfies Record<Branch["kind"], { label: string; short: string; hint: string; icon: Icon }>

export const blockKinds = Object.keys(blocks) as Block["kind"][]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** "3 days", "1 day 2 hours 30 minutes": a wait as people say it. */
export const durationOf = (minutes: number) =>
  [
    [Math.floor(minutes / 1440), "day"],
    [Math.floor((minutes % 1440) / 60), "hour"],
    [minutes % 60, "minute"],
  ]
    .filter(([n]) => n)
    .map(([n, word]) => plural(n as number, word as string))
    .join(" ") || "0 minutes"

const sendLabels = { inbox: "", email: " · by email", both: " · Inbox and email" }

/** A card's second line. `nameOf` names an application (its company) or a loop. */
export const summaryOf = (step: Step, nameOf: (id: string) => string | undefined) => {
  const which = (id: string | undefined) =>
    id ? (nameOf(id) ?? "Pick an application") : "The trigger's application"
  switch (step.kind) {
    case "notify":
      return (step.message || "No message yet") + sendLabels[step.send ?? "inbox"]
    case "addNote":
      return `${which(step.applicationId)}: ${step.text || "no text yet"}`
    case "move":
      return `${which(step.applicationId)} to ${statusLabels[step.to]}`
    case "addEvent":
      return `${step.title || "No title yet"}, ${step.inDays === 0 ? "same day" : `${plural(step.inDays, "day")} later`} at ${step.at}`
    case "findRoles":
      return (step.loopId && nameOf(step.loopId)) || "Pick a loop"
    case "sendEmail":
      return `To ${step.to || "no one yet"}: ${step.subject || "no subject"}`
    case "wait":
      return `For ${durationOf(step.minutes)}`
    case "parallel":
      return `${plural(step.paths.length, "path")} side by side`
    case "decide":
      return step.question || "No question yet"
  }
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export const mailKindLabels = {
  confirmation: "Confirmation",
  interview: "Interview",
  rejection: "Rejection",
  offer: "Offer",
  portal: "Check a portal",
  other: "Other",
} as const

/** "any" for an empty list, else the names joined. */
const anyOf = (names: string[], any: string) => (names.length === 0 ? any : names.join(", "))

export const triggerKinds = {
  manual: "Run now",
  schedule: "On a schedule",
  mail: "An email comes in",
  status: "An application moves",
  booking: "Someone books time",
} satisfies Record<Trigger["kind"], string>

export const triggerInfo = (trigger: Trigger) => {
  const label = triggerKinds[trigger.kind]
  switch (trigger.kind) {
    case "manual":
      return { label, summary: "When you press Run now", icon: PlayIcon }
    case "schedule":
      return {
        label,
        summary: `${trigger.at}, ${
          trigger.days.length === 7
            ? "every day"
            : [...trigger.days]
                .sort((a, b) => a - b)
                .map((d) => weekdays[d])
                .join(", ")
        }`,
        icon: Calendar03Icon,
      }
    case "mail":
      return {
        label,
        summary: `When an email is sorted: ${anyOf(
          trigger.kinds.map((k) => mailKindLabels[k]),
          "any kind"
        )}`,
        icon: Mail01Icon,
      }
    case "status":
      return {
        label,
        summary: `When an application moves to ${anyOf(
          trigger.to.map((s) => statusLabels[s]),
          "any status"
        )}`,
        icon: ArrowMoveUpRightIcon,
      }
    case "booking":
      return { label, summary: "When someone books time with you", icon: CalendarCheckIn01Icon }
  }
}

/** Placeholders a step's text can use: the run's, what its trigger brings, and what a
 * Find roles step found. */
export const placeholdersFor = (trigger: Trigger, steps: Step[], picked = false) => {
  const application = ["{application.company}", "{application.role}", "{application.status}"]
  const base = [
    "{workflow.name}",
    "{run.date}",
    ...(blocksOf(steps).some((b) => b.kind === "findRoles")
      ? ["{loop.name}", "{roles.judged}", "{roles.fits}"]
      : []),
  ]
  switch (trigger.kind) {
    case "mail":
      return [...base, "{email.subject}", "{email.from}", "{email.kind}", ...application]
    case "status":
      return [...base, "{status.from}", "{status.to}", ...application]
    case "booking":
      return [...base, "{booking.title}", "{booking.when}", ...application]
    default:
      return picked ? [...base, ...application] : base
  }
}
