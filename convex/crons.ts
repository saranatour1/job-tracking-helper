import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

crons.interval("start due loops", { minutes: 15 }, internal.api.loops.startDue, {})
crons.interval("start due workflows", { minutes: 5 }, internal.api.automations.startDue, {})

crons.interval("refresh job boards", { hours: 1 }, internal.api.jobs.refreshDue, {})

crons.daily(
  "sweep archive and trash",
  { hourUTC: 3, minuteUTC: 17 },
  internal.api.applications.sweep,
  {}
)

crons.daily("sweep activity", { hourUTC: 3, minuteUTC: 47 }, internal.api.activity.sweep, {})

crons.interval("restart stuck deletes", { minutes: 15 }, internal.api.deletes.restartIfStuck, {})

export default crons
