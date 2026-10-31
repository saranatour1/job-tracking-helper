import { createLogger, initLogger } from "evlog"

initLogger({ pretty: false, redact: { builtins: ["email", "bearer", "jwt"] } })

export const workLog = (name: string, context: Record<string, unknown> = {}) =>
  createLogger({ service: "job-tracking-helper", work: name, ...context })
