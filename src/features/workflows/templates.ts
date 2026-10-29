import type { Id } from "@convex/_generated/dataModel"
import type { Step, Trigger } from "@convex/api/features/automations/validators"

import { blocks } from "./blocks"

export type Draft = { name: string; trigger: Trigger; steps: Step[]; active: boolean }

export const blank: Draft = {
  name: "New workflow",
  trigger: { kind: "manual" },
  steps: [blocks.notify.make()],
  active: true,
}

// Workflows to start from, opened in the builder as unsaved drafts. A Loop's morning
// search is one: a schedule, Find roles with that loop, and a note of what fit.
export const templates = {
  jobSearch: {
    label: "Morning job search",
    hint: "Run a loop each weekday, then tell me what fit",
    make: (zone: string, loopId?: string): Draft => ({
      name: "Morning job search",
      trigger: { kind: "schedule", at: "08:00", days: [1, 2, 3, 4, 5], timeZone: zone },
      steps: [
        { kind: "findRoles", loopId: (loopId ?? "") as Id<"loops"> },
        { kind: "notify", message: "New fits from {loop.name}: {roles.fits}" },
      ],
      active: true,
    }),
  },
  followUp: {
    label: "Follow up after applying",
    hint: "A reminder a week after you apply",
    make: (): Draft => ({
      name: "Follow up after applying",
      trigger: { kind: "status", to: ["applied"] },
      steps: [
        { kind: "wait", minutes: 7 * 24 * 60 },
        {
          kind: "addEvent",
          title: "Follow up with {application.company}",
          inDays: 0,
          at: "09:00",
          minutes: 15,
        },
        {
          kind: "notify",
          message: "Time to follow up with {application.company} about {application.role}",
        },
      ],
      active: true,
    }),
  },
  interview: {
    label: "Interview email",
    hint: "Move it to Interviewing and plan some prep",
    make: (): Draft => ({
      name: "Interview email",
      trigger: { kind: "mail", kinds: ["interview"] },
      steps: [
        { kind: "move", to: "interviewing" },
        {
          kind: "addEvent",
          title: "Prep for {application.company}",
          inDays: 1,
          at: "18:00",
          minutes: 60,
        },
        { kind: "notify", message: "{email.from} wrote about an interview: {email.subject}" },
      ],
      active: true,
    }),
  },
} satisfies Record<
  string,
  { label: string; hint: string; make: (zone: string, loopId?: string) => Draft }
>

export type TemplateName = keyof typeof templates
export const templateNames = Object.keys(templates) as TemplateName[]
