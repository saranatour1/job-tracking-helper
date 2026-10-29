import type { Id } from "@convex/_generated/dataModel"
import type { Draft } from "@convex/api/features/automations/describe"
import {
  type Block,
  onlyIfMatched as matched,
  onlyIfStillAt as stillAt,
} from "@convex/api/features/automations/validators"

import { blocks } from "./blocks"

export type { Draft }

export const blank: Draft = {
  name: "New workflow",
  trigger: { kind: "manual" },
  steps: [blocks.notify.make()],
  active: true,
}

const event = (title: string, inDays: number, at: string, minutes: number): Block => ({
  kind: "addEvent",
  title,
  inDays,
  at,
  minutes,
})
const notify = (message: string, send?: "email" | "both"): Block => ({
  kind: "notify",
  message,
  ...(send && { send }),
})

type Template = {
  label: string
  hint: string
  group: string
  make: (zone: string, loopId?: string) => Pick<Draft, "trigger" | "steps">
}

export const templates = {
  jobSearch: {
    label: "Morning job search",
    hint: "Run a loop each weekday, and tell me only when something fits",
    group: "Find roles",
    make: (zone, loopId) => ({
      trigger: { kind: "schedule", at: "08:00", days: [1, 2, 3, 4, 5], timeZone: zone },
      steps: [
        { kind: "findRoles", loopId: (loopId ?? "") as Id<"loops"> },
        { kind: "onlyIf", fact: "roles.fits", test: "atLeast", value: "1" },
        notify("New fits from {loop.name}: {roles.fits}"),
      ],
    }),
  },
  weeklyReview: {
    label: "Weekly review",
    hint: "Half an hour each Monday to go over your board",
    group: "Find roles",
    make: (zone) => ({
      trigger: { kind: "schedule", at: "09:00", days: [1], timeZone: zone },
      steps: [
        event("Weekly job search review", 0, "09:00", 30),
        notify("Time for your weekly review: check your board and your shortlist."),
      ],
    }),
  },
  followUp: {
    label: "Follow up after applying",
    hint: "A reminder a week after you apply, if you haven't heard back",
    group: "After you apply",
    make: () => ({
      trigger: { kind: "status", to: ["applied"] },
      steps: [
        { kind: "wait", minutes: 7 * 24 * 60 },
        stillAt("Applied"),
        event("Follow up with {application.company}", 0, "09:00", 15),
        notify("Time to follow up with {application.company} about {application.role}"),
      ],
    }),
  },
  goneQuiet: {
    label: "Note when it goes quiet",
    hint: "Three weeks with no news after applying: note it and tell me",
    group: "After you apply",
    make: () => ({
      trigger: { kind: "status", to: ["applied"] },
      steps: [
        { kind: "wait", minutes: 21 * 24 * 60 },
        stillAt("Applied"),
        { kind: "addNote", text: "No news three weeks after applying." },
        notify("No news from {application.company} in three weeks. Move on, or nudge them?"),
      ],
    }),
  },
  interviewPrep: {
    label: "Interview prep",
    hint: "An hour to research the company when an application moves to Interviewing",
    group: "After you apply",
    make: () => ({
      trigger: { kind: "status", to: ["interviewing"] },
      steps: [
        event("Research {application.company}", 1, "18:00", 60),
        notify("Interviewing with {application.company}: research time is on your calendar."),
      ],
    }),
  },
  interview: {
    label: "Interview email",
    hint: "Move it to Interviewing and plan prep time",
    group: "Email",
    make: () => ({
      trigger: { kind: "mail", kinds: ["interview"] },
      steps: [
        matched,
        { kind: "move", to: "interviewing" },
        event("Prep for {application.company}", 1, "18:00", 60),
        notify("{application.company} wants to talk: {email.subject}", "both"),
      ],
    }),
  },
  thankRecruiter: {
    label: "Thank whoever invites you",
    hint: "Reply to an interview invite, if a person wrote it",
    group: "Email",
    make: () => ({
      trigger: { kind: "mail", kinds: ["interview"] },
      steps: [
        matched,
        {
          kind: "decide",
          id: crypto.randomUUID(),
          question:
            "Was this email, from {email.from} about “{email.subject}”, written by a person who'd read a reply, not sent from a no-reply address?",
          paths: [
            {
              label: "A person",
              steps: [
                {
                  kind: "sendEmail",
                  to: "{email.from}",
                  subject: "Re: {email.subject}",
                  text: "Hi,\n\nThank you for reaching out. I'm glad to hear from you and will reply with my availability shortly.\n\nBest,",
                },
              ],
            },
            { label: "No-reply", steps: [] },
          ],
        },
        notify("{email.from} invited you to interview with {application.company}"),
      ],
    }),
  },
  offer: {
    label: "Offer email",
    hint: "Move it to Offer, tell me everywhere, and set time to decide",
    group: "Email",
    make: () => ({
      trigger: { kind: "mail", kinds: ["offer"] },
      steps: [
        matched,
        { kind: "move", to: "offer" },
        notify("An offer from {application.company}: {email.subject}", "both"),
        event("Decide on the {application.company} offer", 3, "10:00", 30),
      ],
    }),
  },
  rejection: {
    label: "Rejection email",
    hint: "Move it to Rejected and keep a note of why",
    group: "Email",
    make: () => ({
      trigger: { kind: "mail", kinds: ["rejection"] },
      steps: [
        matched,
        { kind: "move", to: "rejected" },
        { kind: "addNote", text: "Rejected by email: {email.subject}" },
        notify("{application.company} said no. On to the next one."),
      ],
    }),
  },
  portal: {
    label: "Portal email",
    hint: "Time today to check the company's portal",
    group: "Email",
    make: () => ({
      trigger: { kind: "mail", kinds: ["portal"] },
      steps: [
        matched,
        event("Check the {application.company} portal", 0, "17:00", 15),
        notify("{application.company} asks you to check their portal: {email.subject}"),
      ],
    }),
  },
  booking: {
    label: "New booking",
    hint: "Tell me everywhere, and note it on its application",
    group: "Bookings",
    make: () => ({
      trigger: { kind: "booking" },
      steps: [
        notify("{booking.title}, {booking.when}", "both"),
        matched,
        { kind: "addNote", text: "Booked: {booking.title}, {booking.when}" },
      ],
    }),
  },
} satisfies Record<string, Template>

export type TemplateName = keyof typeof templates
export const templateNames = Object.keys(templates) as TemplateName[]

export const draftOf = (name: TemplateName, zone: string, loopId?: string): Draft => ({
  name: templates[name].label,
  active: true,
  ...templates[name].make(zone, loopId),
})
