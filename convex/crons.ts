import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Starts the loops whose morning has come. Each loop then moves to the next morning.
crons.interval("start due loops", { minutes: 15 }, internal.api.loops.startDue, {})
// Workflows on a schedule; every 5 minutes, so one set for 09:00 starts by 09:05.
crons.interval("start due workflows", { minutes: 5 }, internal.api.automations.startDue, {})

// Fetches the job boards due a refresh, so the shared catalog stays current.
crons.interval("refresh job boards", { hours: 1 }, internal.api.jobs.refreshDue, {})

// Moves applications archived a month ago to the Trash, and empties each person's Trash
// of what's older than they keep.
crons.daily(
  "sweep archive and trash",
  { hourUTC: 3, minuteUTC: 17 },
  internal.api.applications.sweep,
  {}
)

// Activity keeps three months.
crons.daily("sweep activity", { hourUTC: 3, minuteUTC: 47 }, internal.api.activity.sweep, {})

export default crons
