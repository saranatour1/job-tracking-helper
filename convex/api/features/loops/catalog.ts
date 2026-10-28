// Loops: a search that runs once each morning and brings back jobs that fit. People
// set one up by answering yes or no and picking from a few sizes, so every loop stays
// cheap to run and its cost is known before it starts.

export const maxLoops = 3

// The yes/no answers a loop keeps. The setup screen asks them step by step, next to
// what each one makes the run do; these labels are the short form for summaries.
export const loopQuestions = {
  usePreferences: { label: "Searches what you're drawn to" },
  stretch: { label: "Also looks one level up" },
  remoteOnly: { label: "Remote only" },
  nearMe: { label: "In your places" },
  listedCompanies: { label: "Only your companies" },
  skipRedFlags: { label: "Leaves out what you'd avoid" },
  postedToday: { label: "Posted since yesterday" },
} as const
export type LoopQuestion = keyof typeof loopQuestions
export type LoopAnswers = Record<LoopQuestion, boolean>

// How many jobs a morning can bring, and when the run starts in the person's time zone.
export const dailySizes = [5, 10, 20] as const
export const runTimes = ["07:00", "08:00", "09:00"] as const

// Where jobs come from, in the order a run tries them.
export const providers = {
  firecrawl: { name: "Firecrawl" },
  contextDev: { name: "context.dev" },
} as const
export type Provider = keyof typeof providers

// A run moves to the next source once this share of its monthly credits is used, so a
// source never runs dry mid-run.
export const switchAt = 0.9

const allNo = Object.fromEntries(Object.keys(loopQuestions).map((q) => [q, false])) as LoopAnswers

export type LoopTemplate = {
  id: string
  name: string
  pitch: string
  answers: LoopAnswers
  daily: (typeof dailySizes)[number]
  at: (typeof runTimes)[number]
}

export const loopTemplates: LoopTemplate[] = [
  {
    id: "remote-fit",
    name: "Remote roles that fit",
    pitch: "Remote jobs that match what you're drawn to.",
    answers: { ...allNo, usePreferences: true, remoteOnly: true, skipRedFlags: true },
    daily: 10,
    at: "08:00",
  },
  {
    id: "close-to-home",
    name: "Close to home",
    pitch: "On-site and hybrid roles in the places you listed.",
    answers: { ...allNo, usePreferences: true, nearMe: true, skipRedFlags: true },
    daily: 10,
    at: "08:00",
  },
  {
    id: "dream-companies",
    name: "Dream companies watch",
    pitch: "New openings at the companies you'd love to work for.",
    answers: { ...allNo, listedCompanies: true, postedToday: true },
    daily: 5,
    at: "07:00",
  },
  {
    id: "stretch",
    name: "Stretch roles",
    pitch: "A step up that uses the skills you're building.",
    answers: { ...allNo, usePreferences: true, stretch: true, skipRedFlags: true },
    daily: 5,
    at: "09:00",
  },
  {
    id: "fresh-today",
    name: "Fresh this morning",
    pitch: "Everything that fits and was posted since yesterday.",
    answers: {
      ...allNo,
      usePreferences: true,
      postedToday: true,
      skipRedFlags: true,
    },
    daily: 20,
    at: "07:00",
  },
]

// A blank loop starts from the safe defaults: judge with Preferences, skip red flags.
export const blankTemplate: LoopTemplate = {
  id: "custom",
  name: "My loop",
  pitch: "Start from the defaults and answer each question yourself.",
  answers: { ...allNo, usePreferences: true, skipRedFlags: true },
  daily: 10,
  at: "08:00",
}

export const templateById = (id: string | undefined) =>
  id === blankTemplate.id ? blankTemplate : loopTemplates.find((t) => t.id === id)

// A run reads about three postings for each one it keeps.
export const scannedPerRun = (daily: number) => daily * 3

// Rough credits for one run on either provider: searching costs about 1 credit per 10
// results and reading each posting costs 1. ponytail: an estimate for the setup screen;
// real runs record what the provider charged.
export const creditsPerRun = (daily: number) =>
  Math.ceil(scannedPerRun(daily) / 10) + scannedPerRun(daily)
