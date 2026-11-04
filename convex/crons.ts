import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

crons.interval("start due loops", { hours: 12 }, internal.api.loops.startDue, {})
crons.interval("start due workflows", { hours: 12 }, internal.api.automations.startDue, {})

crons.interval("refresh job boards", { hours: 12 }, internal.api.jobs.refreshDue, {})
crons.interval("research companies", { hours: 12 }, internal.api.jobs.researchDue, {})
crons.daily("count job trends", { hourUTC: 2, minuteUTC: 17 }, internal.api.jobs.countTrends, {})
crons.daily(
  "write the jobs sitemap",
  { hourUTC: 2, minuteUTC: 47 },
  internal.api.jobs.startSitemap,
  {}
)

crons.daily(
  "sweep archive and trash",
  { hourUTC: 3, minuteUTC: 17 },
  internal.api.applications.sweep,
  {}
)

crons.daily("sweep activity", { hourUTC: 3, minuteUTC: 47 }, internal.api.activity.sweep, {})

crons.interval("restart stuck workers", { hours: 12 }, internal.api.deletes.restartIfStuck, {})

export default crons
