import { useSyncExternalStore } from "react"

import type { Display } from "./display-options"

// shortcut: hard-coded sample data while the tracker UI has no backend; replace
// with Convex queries once the schema in docs/database-design.md exists.

export const statuses = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
] as const
export type Status = (typeof statuses)[number]

import { statusLabels } from "@convex/api/features/applications/validators"

export { statusLabels }

export const priorities = ["urgent", "high", "medium", "low", "none"] as const
export type Priority = (typeof priorities)[number]

export const priorityLabels: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
}

export const labels = ["Remote", "Referral", "Dream company", "Startup", "Contract"] as const
export type Label = (typeof labels)[number]

export const methods = ["Company site", "LinkedIn", "Referral", "Recruiter", "Email"] as const
export type Method = (typeof methods)[number]

export type Event = { status: Status; at: string; note?: string }

export type Application = {
  id: string
  // A short code to show, like APP-21. Real applications don't have one yet.
  code?: string
  // The posting, when there is one.
  url?: string
  role: string
  company: string
  status: Status
  priority: Priority
  labels: Label[]
  method: Method
  location: string
  goalId?: string
  createdAt: string
  description: string
  history: Event[]
  tasks?: Task[]
  notes?: Note[]
  // Jev's fit score, 0 to 100, when a loop found the role or its link was checked.
  fit?: number
  isFit?: boolean
  // Off the board, in the Archived tab.
  archived?: boolean
}

export type Task = { title: string; done: boolean }
export type Note = { text: string; at: string }

export type Milestone = { name: string; done: boolean; target?: string }

export type Goal = {
  id: string
  name: string
  summary: string
  priority: Priority
  start: string
  target: string
  milestones: Milestone[]
  // A loop whose roles join this goal when added to the board.
  loopId?: string
}

// Filters are "field is one of values". A view is a saved set of filters.
export const filterFields = ["status", "priority", "label", "goal", "company", "method"] as const
export type FilterField = (typeof filterFields)[number]
export type Filters = Partial<Record<FilterField, string[]>>

// A view is a saved set of filters plus how to show them: board or list, grouping, ordering.
export type View = {
  id: string
  name: string
  description: string
  filters: Filters
  display?: Partial<Display>
}

// Sample dates are relative to this fixed day, so the server and the browser render the same text.
export const today = "2026-10-28"

export const goals: Goal[] = [
  {
    id: "frontend-role",
    name: "Land a frontend role",
    summary: "A full-time frontend or full-stack role before the end of Q1.",
    priority: "high",
    start: "2026-09-15",
    target: "2027-03-31",
    milestones: [
      { name: "Polish resume and portfolio", done: true, target: "2026-09-30" },
      { name: "Apply to 30 companies", done: false, target: "2026-11-30" },
      { name: "Reach 5 interviews", done: false, target: "2027-01-15" },
      { name: "Get one offer", done: false, target: "2027-03-31" },
    ],
  },
  {
    id: "weekly-habit",
    name: "Apply every week",
    summary: "Five good applications a week, tracked here.",
    priority: "medium",
    start: "2026-09-01",
    target: "2026-12-31",
    milestones: [
      { name: "First 10 applications", done: true },
      { name: "4 weeks in a row", done: true },
      { name: "8 weeks in a row", done: false },
    ],
  },
  {
    id: "contract-work",
    name: "Contract work on the side",
    summary: "Short contracts to keep income steady while searching.",
    priority: "low",
    start: "2026-11-02",
    target: "2026-12-15",
    milestones: [
      { name: "Update freelance profiles", done: false },
      { name: "Land one contract", done: false },
    ],
  },
  {
    id: "portfolio",
    name: "Rebuild the portfolio",
    summary: "A new portfolio site with three case studies.",
    priority: "medium",
    start: "2026-08-03",
    target: "2026-09-14",
    milestones: [
      { name: "Pick three projects", done: true },
      { name: "Write the case studies", done: true },
      { name: "Ship the site", done: true },
    ],
  },
]

const app = (a: Omit<Application, "history"> & { history?: Event[] }): Application => ({
  ...a,
  history: a.history ?? [{ status: a.status, at: a.createdAt }],
})

const sample: Application[] = [
  app({
    id: "APP-21",
    role: "Senior Frontend Engineer",
    company: "Linear",
    status: "interviewing",
    priority: "urgent",
    labels: ["Remote", "Dream company"],
    method: "Referral",
    location: "Remote, EU",
    goalId: "frontend-role",
    createdAt: "2026-10-02",
    description: "Referred by a former teammate. Second round is a take-home on their editor.",
    tasks: [
      { title: "Read the take-home brief", done: true },
      { title: "Finish the editor take-home", done: false },
      { title: "Prepare questions for the team", done: false },
    ],
    notes: [{ text: "Hiring manager cares a lot about performance work.", at: "2026-10-16" }],
    history: [
      { status: "saved", at: "2026-10-02" },
      { status: "applied", at: "2026-10-04", note: "Referral submitted" },
      { status: "interviewing", at: "2026-10-15", note: "Recruiter screen passed" },
    ],
  }),
  app({
    id: "APP-20",
    role: "Product Engineer",
    company: "Convex",
    status: "applied",
    priority: "high",
    labels: ["Remote", "Startup"],
    method: "Company site",
    location: "Remote, US",
    goalId: "frontend-role",
    createdAt: "2026-10-20",
    description: "Full-stack role on the dashboard team.",
    history: [
      { status: "saved", at: "2026-10-18" },
      { status: "applied", at: "2026-10-20" },
    ],
  }),
  app({
    id: "APP-19",
    role: "Frontend Developer",
    company: "Vercel",
    status: "rejected",
    priority: "medium",
    labels: ["Remote"],
    method: "LinkedIn",
    location: "Remote",
    goalId: "frontend-role",
    createdAt: "2026-09-12",
    description: "Applied through LinkedIn Easy Apply.",
    history: [
      { status: "applied", at: "2026-09-12" },
      { status: "rejected", at: "2026-10-01", note: "Position filled internally" },
    ],
  }),
  app({
    id: "APP-18",
    role: "UI Engineer",
    company: "Figma",
    status: "saved",
    priority: "high",
    labels: ["Dream company"],
    method: "Company site",
    location: "San Francisco, CA",
    goalId: "frontend-role",
    createdAt: "2026-10-25",
    description: "Posting closes mid-November. Tailor the resume around design systems work.",
  }),
  app({
    id: "APP-17",
    role: "Web Developer (contract)",
    company: "Acme Studio",
    status: "offer",
    priority: "medium",
    labels: ["Contract", "Remote"],
    method: "Recruiter",
    location: "Remote",
    goalId: "contract-work",
    createdAt: "2026-09-28",
    description: "Three-month contract, 20 hours a week.",
    history: [
      { status: "applied", at: "2026-09-28" },
      { status: "interviewing", at: "2026-10-06" },
      { status: "offer", at: "2026-10-22", note: "Offer letter received" },
    ],
  }),
  app({
    id: "APP-16",
    role: "Frontend Engineer",
    company: "Raycast",
    status: "applied",
    priority: "medium",
    labels: ["Remote", "Startup"],
    method: "Email",
    location: "Remote, EU",
    goalId: "weekly-habit",
    createdAt: "2026-10-14",
    description: "Sent a short email with the portfolio link.",
    history: [{ status: "applied", at: "2026-10-14" }],
  }),
  app({
    id: "APP-15",
    role: "Software Engineer, Growth",
    company: "Notion",
    status: "interviewing",
    priority: "high",
    labels: ["Referral"],
    method: "Referral",
    location: "New York, NY",
    goalId: "frontend-role",
    createdAt: "2026-09-30",
    description: "Onsite loop scheduled for early November.",
    tasks: [
      { title: "Review Notion's growth experiments blog", done: false },
      { title: "Practice two system design questions", done: false },
    ],
    history: [
      { status: "applied", at: "2026-09-30" },
      { status: "interviewing", at: "2026-10-12", note: "Hiring manager call" },
    ],
  }),
  app({
    id: "APP-14",
    role: "React Developer",
    company: "Shopify",
    status: "withdrawn",
    priority: "low",
    labels: ["Remote"],
    method: "LinkedIn",
    location: "Remote, Canada",
    goalId: "weekly-habit",
    createdAt: "2026-09-08",
    description: "Withdrew after the salary range came back too low.",
    history: [
      { status: "applied", at: "2026-09-08" },
      { status: "withdrawn", at: "2026-09-25", note: "Salary mismatch" },
    ],
  }),
  app({
    id: "APP-13",
    role: "Design Engineer",
    company: "Arc",
    status: "saved",
    priority: "none",
    labels: ["Startup"],
    method: "Company site",
    location: "New York, NY",
    createdAt: "2026-10-26",
    description: "Need a stronger motion design sample before applying.",
  }),
  app({
    id: "APP-12",
    role: "Frontend Engineer",
    company: "Stripe",
    status: "applied",
    priority: "high",
    labels: ["Dream company"],
    method: "Company site",
    location: "Dublin, Ireland",
    goalId: "frontend-role",
    createdAt: "2026-10-09",
    description: "No reply yet. Follow up if nothing by early November.",
    tasks: [{ title: "Send a follow-up email to the recruiter", done: false }],
    history: [{ status: "applied", at: "2026-10-09" }],
  }),
  app({
    id: "APP-11",
    role: "Full-stack Developer",
    company: "Supabase",
    status: "rejected",
    priority: "low",
    labels: ["Remote", "Startup"],
    method: "Company site",
    location: "Remote",
    goalId: "weekly-habit",
    createdAt: "2026-09-02",
    description: "Rejected after the take-home.",
    history: [
      { status: "applied", at: "2026-09-02" },
      { status: "interviewing", at: "2026-09-10" },
      { status: "rejected", at: "2026-09-24", note: "Take-home feedback: good, not senior enough" },
    ],
  }),
]

// shortcut: sample edits live in memory and reset on reload; Goals still read these until
// they move to Convex. `applications` is a live binding, so every importer sees edits.
export let applications = sample
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const changed = () => {
  for (const listener of listeners) listener()
}
export const updateApplication = (id: string, patch: Partial<Application>) => {
  applications = applications.map((a) => (a.id === id ? { ...a, ...patch } : a))
  changed()
}
export const useApplications = () =>
  useSyncExternalStore(
    subscribe,
    () => applications,
    () => sample
  )

export const goalName = (from: Goal[], id?: string) =>
  from.find((g) => g.id === id)?.name ?? "No goal"

export const findApplication = (id: string) => applications.find((a) => a.id === id)

// Returns an application's values for one filter field, in the form filters store them.
export const fieldValues = (a: Application, field: FilterField): string[] => {
  switch (field) {
    case "label":
      return a.labels
    case "goal":
      return [a.goalId ?? "none"]
    default:
      return [a[field]]
  }
}

export const matches = (a: Application, filters: Filters) =>
  Object.entries(filters).every(
    ([field, values]) =>
      !values?.length || fieldValues(a, field as FilterField).some((v) => values.includes(v))
  )

// Every value a filter field can take, with its display label. Companies, labels and goals
// come from what's on screen, real or sample.
export const fieldOptions = (
  field: FilterField,
  from: Application[] = applications,
  goalList: Goal[] = goals
): { value: string; label: string }[] => {
  switch (field) {
    case "status":
      return statuses.map((s) => ({ value: s, label: statusLabels[s] }))
    case "priority":
      return priorities.map((p) => ({ value: p, label: priorityLabels[p] }))
    case "label":
      return [...new Set([...labels, ...from.flatMap((a) => a.labels)])].map((l) => ({
        value: l,
        label: l,
      }))
    case "goal":
      return [
        ...goalList.map((g) => ({ value: g.id, label: g.name })),
        { value: "none", label: "No goal" },
      ]
    case "company":
      return [...new Set(from.map((a) => a.company))].sort().map((c) => ({ value: c, label: c }))
    case "method":
      return methods.map((m) => ({ value: m, label: m }))
  }
}

export const optionLabel = (field: FilterField, value: string, goalList: Goal[] = goals) =>
  fieldOptions(field, applications, goalList).find((o) => o.value === value)?.label ?? value

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
export const formatDate = (iso: string) => dateFormat.format(new Date(iso))

export const ago = (iso: string) => {
  const days = Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000)
  if (days < 1) return "today"
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  return `${Math.floor(days / 30)}mo`
}

// Milestones as the goal form writes them: one per line, with a YYYY-MM-DD at the end as
// its target date. A milestone keeps its tick while its name stays the same.
export const milestoneLine = (m: Milestone) => (m.target ? `${m.name} ${m.target}` : m.name)
export const parseMilestones = (text: string, was: Milestone[] = []): Milestone[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [, name = line, target] = /^(.*?)\s*(\d{4}-\d{2}-\d{2})?$/.exec(line) ?? []
      const done = was.find((m) => m.name === name)?.done ?? false
      return { name: name || line, done, ...(target && { target }) }
    })

// A goal with no milestones is done when its target date has passed.
export const goalProgress = (goal: Goal, on = today) =>
  goal.milestones.length
    ? Math.round((goal.milestones.filter((m) => m.done).length / goal.milestones.length) * 100)
    : goal.target < on
      ? 100
      : 0

// Missed: the target date passed with milestones left unticked.
export const goalStatus = (goal: Goal, on = today) =>
  goalProgress(goal, on) === 100
    ? "Completed"
    : goal.target < on
      ? "Missed"
      : goal.start > on
        ? "Upcoming"
        : "Active"
