import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Starts the loops whose morning has come. Each loop then moves to the next morning.
crons.interval("start due loops", { minutes: 15 }, internal.loops.startDue, {})

// Fetches the job boards due a refresh, so the shared catalog stays current.
crons.interval("refresh job boards", { hours: 1 }, internal.jobs.refreshDue, {})

export default crons
