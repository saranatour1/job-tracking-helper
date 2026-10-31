import { useSyncExternalStore } from "react"

// The home page's demo: made-up applications that move through the board on their own.
// Everything comes from one number, the tick, so the server and the first client render match.

const companies = [
  "Kestrel",
  "Fieldnote",
  "Marlow",
  "Quarry",
  "Sundial",
  "Wren",
  "Brightline",
  "Juniper",
  "Halcyon",
  "Parcelwise",
  "Alder",
  "Lantern",
  "Orbit Labs",
  "Tallow",
  "Cobalt Health",
  "Northfield",
  "Vesper",
  "Ferrous",
  "Larkspur",
]
const roles = [
  "Staff Engineer",
  "Senior Product Designer",
  "Frontend Engineer",
  "Platform Engineer",
  "Design Engineer",
  "Backend Engineer",
  "Engineering Manager",
]
const interviewNotes = ["Call on Tuesday", "Reply needed", "Call on Friday"]

export const demoColumns = ["saved", "applied", "interviewing", "offer"] as const

// How many ticks a card stays in each column. A new card arrives every tick, so these are
// also how many cards each column holds, before the funnel below thins them out.
const savedUntil = 6
const appliedUntil = savedUntil + 6
const interviewingUntil = appliedUntil + 12
const offerUntil = interviewingUntil + 12
const interviewEvery = 4
const offerEvery = 12

export type DemoCard = {
  id: number
  company: string
  role: string
  fit: number
  column: number
  row: number
  note?: string
  ready: boolean
  moving: boolean
  leaving: boolean
}

const columnAt = (id: number, age: number) => {
  if (age < savedUntil) return 0
  if (age < appliedUntil) return 1
  if (age < interviewingUntil) return id % interviewEvery === 0 ? 2 : undefined
  if (age < offerUntil) return id % offerEvery === 0 ? 3 : undefined
  return undefined
}

const noteFor = (id: number, age: number, column: number) => {
  if (column === 1) return age < savedUntil + 3 ? "Sent today" : "Sent yesterday"
  if (column === 2) return interviewNotes[(id / interviewEvery) % interviewNotes.length]
  if (column === 3) return "Offer received"
  return undefined
}

export const boardAt = (tick: number) => {
  // Starting a full lifetime in means the board is already busy on the first frame.
  const now = tick + offerUntil
  const rows = demoColumns.map(() => 0)
  const cards: DemoCard[] = []
  // Newest first, so the card that just arrived in a column takes its top row.
  for (let id = now; id > now - offerUntil; id--) {
    const age = now - id
    const column = columnAt(id, age)
    if (column === undefined) continue
    cards.push({
      id,
      company: companies[id % companies.length],
      role: roles[id % roles.length],
      fit: 62 + ((id * 7) % 30),
      column,
      row: rows[column]++,
      note: noteFor(id, age, column),
      ready: age >= savedUntil - 2 && age < savedUntil,
      moving: age > 0 && columnAt(id, age - 1) !== column,
      leaving: columnAt(id, age + 1) === undefined,
    })
  }
  return {
    cards,
    newest: cards[0],
    counts: [
      38,
      64 + tick,
      5 + Math.floor(tick / interviewEvery),
      1 + Math.floor(tick / offerEvery),
    ],
  }
}

let tick = 0
const subscribe = (listener: () => void) => {
  // Without motion the board just stays on its current frame.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {}
  const timer = setInterval(() => {
    tick++
    listener()
  }, 1500)
  return () => clearInterval(timer)
}

export const useDemoTick = () =>
  useSyncExternalStore(
    subscribe,
    () => tick,
    () => 0
  )
