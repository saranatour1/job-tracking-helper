import type { Kind } from "../email/match"
import type { MutationCtx } from "../../_generated/server"
import { internal } from "../../_generated/api"

export const mailWords: Record<Kind, string> = {
  confirmation: "Application received",
  interview: "Interview",
  rejection: "Rejected",
  offer: "Offer",
  portal: "Portal update",
  other: "Email",
}

// For account deletion: notifications and settings go in batches.
export const deleteNotifications = (ctx: MutationCtx, owner: string) =>
  ctx.scheduler.runAfter(0, internal.inbox.removeNotifications, { owner })
