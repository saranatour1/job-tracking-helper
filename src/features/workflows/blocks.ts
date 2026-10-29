import type { Block, Step, Trigger } from "@convex/api/features/automations/validators"
import {
  Calendar03Icon,
  GitForkIcon,
  HourglassIcon,
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
  addNote: {
    label: "Add note",
    group: "Do",
    hint: "On one application",
    icon: NoteEditIcon,
    color: "blue",
    // A note needs an application; the builder asks for one before it saves.
    make: (): Block => ({ kind: "addNote", applicationId: "" as never, text: "" }),
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

export const split = {
  label: "Split into paths",
  hint: "Run steps side by side",
  icon: GitForkIcon,
}

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

/** A card's second line. */
export const summaryOf = (step: Step, companyOf: (id: string) => string | undefined) => {
  switch (step.kind) {
    case "notify":
      return step.message || "No message yet"
    case "addNote": {
      const company = step.applicationId ? companyOf(step.applicationId) : undefined
      return company ? `${company}: ${step.text || "no text yet"}` : "Pick an application"
    }
    case "wait":
      return `For ${durationOf(step.minutes)}`
    case "parallel":
      return `${plural(step.paths.length, "path")} side by side`
  }
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export const triggerInfo = (trigger: Trigger) =>
  trigger.kind === "manual"
    ? { label: "Run now", summary: "When you press Run now", icon: PlayIcon }
    : {
        label: "On a schedule",
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

/** Placeholders a step's text can use, by block. */
export const placeholders: Record<"notify" | "addNote", string[]> = {
  notify: ["{workflow.name}", "{run.date}"],
  addNote: [
    "{workflow.name}",
    "{run.date}",
    "{application.company}",
    "{application.role}",
    "{application.status}",
  ],
}
