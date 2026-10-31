import type { MutationCtx } from "../../_generated/server"
import type { Id, Doc } from "../../_generated/dataModel"
import { ConvexError } from "convex/values"
import { defaultTrashDays, type Status, limits, priorityFor, statusLabels } from "./validators"
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
    .withIndex("by_userId_and_applicationId", (q) =>
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
  for (const page of await ctx.db
    .query("bookingPages")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(50))
    if (page.applicationId === applicationId)
      await ctx.db.patch("bookingPages", page._id, { applicationId: undefined })
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
}

export const fillFromJob = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  applicationId: Id<"applications">,
  job: { fit: number; location?: string; snippet?: string }
) => {
  const application = await ctx.db.get("applications", applicationId)
  if (application?.userId !== userId) return
  const labels = application.labels ?? []
  const remote = /remote/i.test(job.location ?? "") && !labels.includes("Remote")
  await ctx.db.patch("applications", applicationId, {
    ...((application.priority ?? "none") === "none" && { priority: priorityFor(job.fit) }),
    ...(!application.location && job.location && { location: job.location }),
    ...(!application.description && job.snippet && { description: job.snippet }),
    ...(remote && { labels: [...labels, "Remote"] }),
  })
}
