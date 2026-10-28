import { createLogger, initLogger } from "evlog"

// One wide event per unit of work, such as a loop run: build it up with `set` as the
// work goes, then `emit` once. JSON output, so the Convex dashboard's logs can be
// searched by field.
initLogger({ pretty: false })

export const workLog = (name: string, context: Record<string, unknown> = {}) =>
  createLogger({ service: "job-tracking-helper", work: name, ...context })
