import { type Status, statusLabels } from "../applications/validators"
import type { Kind } from "../email/match"
import {
  type Block,
  limits,
  onlyIfMatched,
  onlyIfStillAt,
  triggerHasApplication,
  type Trigger,
  type Draft,
} from "./validators"

const choice = <K extends string>(instructions: string, criteria: Record<K, string>) => ({
  type: "choice" as const,
  instructions,
  criteria,
})
const yes = (instructions: string) => ({ type: "boolean" as const, instructions })

export const describeQuestions = {
  trigger: choice("What should start the workflow `request` describes?", {
    manual: "Only when the person presses Run now, or nothing about when is said",
    schedule: "A time of day, like every morning or each Monday",
    mail: "An email about a job application coming in",
    status: "An application moving to a status, like after applying or getting an offer",
  }),
  time: choice("If `request` runs on a schedule, at what time of day?", {
    t07: "Early morning, around 7",
    t09: "Morning, or no time is said",
    t12: "Around midday",
    t17: "Late afternoon, or the end of the workday",
    t20: "Evening",
  }),
  days: choice("If `request` runs on a schedule, on which days?", {
    weekdays: "Weekdays, or no days are said",
    everyDay: "Every day, weekends too",
    weekly: "Once a week",
  }),
  mailKind: choice("If `request` starts when an email comes in, which kind of email?", {
    any: "Any email, or no kind is said",
    interview: "An interview invitation",
    offer: "A job offer",
    rejection: "A rejection",
    confirmation: "A confirmation that an application was received",
    portal: "A request to check a portal or status page",
  }),
  statusTo: choice("If `request` starts when an application moves, to which status?", {
    any: "Any status, or none is said",
    applied: "Applied",
    interviewing: "Interviewing",
    offer: "Offer",
    rejected: "Rejected",
  }),
  findRoles: yes("Does `request` ask to look for or find new job openings?"),
  wait: yes("Does `request` ask to wait some time, like a few days, before doing something?"),
  waitFor: choice("How long does `request` ask to wait?", {
    hours: "An hour or a few hours",
    day: "A day",
    days: "A few days",
    week: "About a week, or no length is said",
    weeks: "Two weeks or more",
  }),
  move: yes(
    "Does `request` ask to move, mark or set something to a status such as Applied, Interviewing, Offer, Rejected or Withdrawn?"
  ),
  moveTo: choice("To which status does `request` ask to move the application?", {
    applied: "Applied",
    interviewing: "Interviewing",
    offer: "Offer",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
  }),
  addEvent: yes("Does `request` ask to put something on the calendar, or plan time for something?"),
  eventFor: choice("What is the calendar event in `request` for?", {
    followUp: "Following up with the company",
    prep: "Preparing for an interview",
    other: "Something else",
  }),
  eventIn: choice("When should the calendar event in `request` be?", {
    sameDay: "The same day",
    nextDay: "The next day, or no day is said",
    fewDays: "In a few days",
    week: "In a week",
  }),
  addNote: yes("Does `request` ask to add a note to the application?"),
  notify: yes("Does `request` ask to tell, notify or remind the person themselves?"),
  notifyBy: choice("How does `request` ask to tell the person?", {
    inbox: "In the app, or no way is said",
    email: "By email",
    both: "Both in the app and by email",
  }),
  reply: yes("Does `request` ask to email or reply to the person who wrote, like a recruiter?"),
}

type Questions = typeof describeQuestions
export type DescribeAnswers = {
  [Q in keyof Questions]?: Questions[Q] extends { criteria: infer C } ? keyof C : boolean
}

const times = { t07: "07:00", t09: "09:00", t12: "12:00", t17: "17:00", t20: "20:00" }
const days = { weekdays: [1, 2, 3, 4, 5], everyDay: [0, 1, 2, 3, 4, 5, 6], weekly: [1] }
const waits = { hours: 3 * 60, day: 1440, days: 3 * 1440, week: 7 * 1440, weeks: 14 * 1440 }
const eventDays = { sameDay: 0, nextDay: 1, fewDays: 3, week: 7 }

export const draftFrom = (
  answers: DescribeAnswers,
  { request, zone, loopId }: { request: string; zone: string; loopId?: string }
): Draft => {
  const trigger: Trigger =
    answers.trigger === "schedule"
      ? {
          kind: "schedule",
          at: times[answers.time ?? "t09"],
          days: days[answers.days ?? "weekdays"],
          timeZone: zone,
        }
      : answers.trigger === "mail"
        ? {
            kind: "mail",
            kinds:
              !answers.mailKind || answers.mailKind === "any" ? [] : [answers.mailKind as Kind],
          }
        : answers.trigger === "status"
          ? {
              kind: "status",
              to:
                !answers.statusTo || answers.statusTo === "any" ? [] : [answers.statusTo as Status],
            }
          : { kind: "manual" }
  const about = triggerHasApplication(trigger)
  const company = about ? " with {application.company}" : ""
  const said = {
    manual: "{workflow.name} ran on {run.date}",
    schedule: "{workflow.name} ran on {run.date}",
    mail: "{email.kind} email from {email.from}: {email.subject}",
    status: "{application.company} moved to {status.to}",
    goal: "{application.company} joined {goal.name}",
  }[trigger.kind]

  const steps: Block[] = []
  if (trigger.kind === "mail" && (answers.move || answers.addNote || answers.addEvent))
    steps.push(onlyIfMatched)
  if (answers.findRoles) steps.push({ kind: "findRoles", loopId: (loopId ?? "") as never })
  if (answers.wait) {
    steps.push({ kind: "wait", minutes: waits[answers.waitFor ?? "week"] })
    if (trigger.kind === "status" && trigger.to.length === 1)
      steps.push(onlyIfStillAt(statusLabels[trigger.to[0]!]))
  }
  if (answers.move) steps.push({ kind: "move", to: answers.moveTo ?? "interviewing" })
  if (answers.addNote) steps.push({ kind: "addNote", text: said })
  if (answers.addEvent) {
    const title = {
      followUp: `Follow up${company}`,
      prep: about ? "Prep for {application.company}" : "Interview prep",
      other: "{workflow.name}",
    }[answers.eventFor ?? "other"]
    const inDays = eventDays[answers.eventIn ?? "nextDay"]
    steps.push({ kind: "addEvent", title, inDays, at: "09:00", minutes: 30 })
  }
  if (answers.reply && trigger.kind === "mail")
    steps.push({
      kind: "sendEmail",
      to: "{email.from}",
      subject: "Re: {email.subject}",
      text: "Hi,\n\nThank you for your email. I'll get back to you soon.\n\nBest,",
    })
  const doesNothing = steps.every((step) => step.kind === "onlyIf")
  if (answers.notify || doesNothing)
    steps.push({
      kind: "notify",
      message: answers.findRoles ? "New fits from {loop.name}: {roles.fits}" : said,
      ...(answers.notifyBy && answers.notifyBy !== "inbox" && { send: answers.notifyBy }),
    })

  const sentence = request.trim().split(/(?<=[.!?])\s/)[0] ?? ""
  const name = sentence.length > limits.name ? `${sentence.slice(0, limits.name - 1)}…` : sentence
  return {
    name: name ? name[0]!.toUpperCase() + name.slice(1) : "New workflow",
    trigger,
    steps,
    active: true,
  }
}
