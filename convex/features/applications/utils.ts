import type { MutationCtx } from "../../_generated/server"
import type { Id, Doc } from "../../_generated/dataModel"
import { ConvexError } from "convex/values"
import {
  defaultTrashDays,
  type Status,
  isSent,
  limits,
  priorityFor,
  statusLabels,
} from "./validators"
import { workLog } from "../../lib/log"
import { keepLog, logEdit } from "../activity/utils"
import { fireEvent } from "../automations/fire"

export const day = 24 * 60 * 60 * 1000

export const batch = 25

export const ownAnywhere = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"applications">
) => {
  const application = await ctx.db.get("applications", id)
  if (application?.userId !== userId) throw new ConvexError("That application isn't yours.")
  return application
}

export const trashDaysOf = (user: Doc<"users"> | null) => user?.trashDays ?? defaultTrashDays

export const purgeAtOf = (trashedAt: number, days: number) =>
  days ? trashedAt + days * day : undefined

export const deleteApplication = async (ctx: MutationCtx, application: Doc<"applications">) => {
  const { userId, _id: applicationId } = application
  for await (const mail of ctx.db
    .query("mailEvents")
    .withIndex("by_userId_and_applicationId_and_at", (q) =>
      q.eq("userId", userId).eq("applicationId", applicationId)
    ))
    await ctx.db.patch("mailEvents", mail._id, { applicationId: undefined, suggest: undefined })
  for (const lead of await ctx.db
    .query("jobLeads")
    .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId))
    .take(50))
    await ctx.db.patch("jobLeads", lead._id, { applicationId: undefined })
  for (const event of await ctx.db
    .query("calendarEvents")
    .withIndex("by_userId_and_applicationId", (q) =>
      q.eq("userId", userId).eq("applicationId", applicationId)
    )
    .take(500))
    await ctx.db.patch("calendarEvents", event._id, { applicationId: undefined })
  for (const prefill of await ctx.db
    .query("prefills")
    .withIndex("by_userId_and_applicationId", (q) =>
      q.eq("userId", userId).eq("applicationId", applicationId)
    )
    .take(50))
    await ctx.db.patch("prefills", prefill._id, { applicationId: undefined })
  for await (const contact of ctx.db
    .query("contacts")
    .withIndex("by_userId_and_applicationId", (q) =>
      q.eq("userId", userId).eq("applicationId", applicationId)
    ))
    await ctx.db.patch("contacts", contact._id, { applicationId: undefined })
  await ctx.db.delete("applications", applicationId)
}

export const moveToTrash = async (ctx: MutationCtx, application: Doc<"applications">) => {
  const now = Date.now()
  const days = trashDaysOf(await ctx.db.get("users", application.userId))
  await ctx.db.patch("applications", application._id, {
    trashedAt: now,
    archivedAt: undefined,
    purgeAt: purgeAtOf(now, days),
  })
}

export const own = async (ctx: MutationCtx, userId: Id<"users">, id: Id<"applications">) => {
  const application = await ctx.db.get("applications", id)
  if (application?.userId !== userId) throw new ConvexError("That application isn't yours.")
  if (application.trashedAt !== undefined)
    throw new ConvexError("That application is in the Trash.")
  return application
}

// The board loads every row, so it leaves out the two fields that can be long.
export const cardOf = ({ description: _description, notes, ...card }: Doc<"applications">) => {
  const lastNoteAt = notes?.at(-1)?.at
  return { ...card, ...(lastNoteAt !== undefined && { lastNoteAt }) }
}

export const capped = <T>(items: T[], max: number) => items.slice(-max)

export const nextNumber = async (ctx: MutationCtx, userId: Id<"users">) => {
  const user = await ctx.db.get("users", userId)
  const number = user?.nextApplicationNumber ?? 1
  await ctx.db.patch("users", userId, { nextApplicationNumber: number + 1 })
  return number
}

export const logNewApplication = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  applicationId: Id<"applications">,
  company: string
) => {
  await logEdit(ctx, userId, "application.added", `Added ${company}`, { applicationId })
}

// Back at Saved takes it off, so a misdrag or an undone move leaves nothing behind.
export const syncSend = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  applicationId: Id<"applications">,
  status: Status,
  at = Date.now()
) => {
  const send = await ctx.db
    .query("applicationSends")
    .withIndex("by_applicationId", (q) => q.eq("applicationId", applicationId))
    .unique()
  if (status === "saved") {
    if (send) await ctx.db.delete("applicationSends", send._id)
  } else if (!send && isSent(status))
    await ctx.db.insert("applicationSends", { userId, applicationId, at })
}

export const changeStatus = async (
  ctx: MutationCtx,
  application: Doc<"applications">,
  status: Status,
  note?: string,
  { quiet = false }: { quiet?: boolean } = {}
) => {
  if (application.status === status) return
  const log = workLog("application.status", {
    userId: application.userId,
    applicationId: application._id,
  })
  log.set({
    summary: `${application.company}: ${statusLabels[application.status]} to ${statusLabels[status]}`,
    outcome: "moved",
  })
  await keepLog(ctx, log)
  if (!quiet)
    await fireEvent(ctx, application.userId, {
      kind: "status",
      from: application.status,
      to: status,
      applicationId: application._id,
    })
  await ctx.db.patch("applications", application._id, {
    status,
    history: capped(
      [...application.history, { status, at: Date.now(), ...(note && { note }) }],
      limits.history
    ),
  })
  await syncSend(ctx, application.userId, application._id, status)
}

export const fitOf = (lead: Pick<Doc<"jobLeads">, "fit" | "verdict">) => ({
  fit: lead.fit,
  isFit: lead.verdict === "fit",
})

export const fillFromJob = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  applicationId: Id<"applications">,
  job: Pick<Doc<"jobLeads">, "fit" | "verdict"> & { location?: string; snippet?: string }
) => {
  const application = await ctx.db.get("applications", applicationId)
  if (application?.userId !== userId) return
  const labels = application.labels ?? []
  const remote = /remote/i.test(job.location ?? "") && !labels.includes("Remote")
  await ctx.db.patch("applications", applicationId, {
    ...(application.fit === undefined && fitOf(job)),
    ...((application.priority ?? "none") === "none" && { priority: priorityFor(job.fit) }),
    ...(!application.location && job.location && { location: job.location }),
    ...(!application.description && job.snippet && { description: job.snippet }),
    ...(remote && { labels: [...labels, "Remote"] }),
  })
}
