import { parseKeys, type Keys, open, seal } from "../../lib/secrets"
import { env, type QueryCtx, type MutationCtx, type ActionCtx } from "../../_generated/server"
import { type Type, type } from "arktype"
import type { Id } from "../../_generated/dataModel"
import { internal, components } from "../../_generated/api"
import { RateLimiter, HOUR } from "@convex-dev/rate-limiter"
import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError } from "convex/values"
import { Details, Received } from "./validators"
import { removeInbound } from "./cloudflare"
import { hasSignature, type SignatureInfo, signed, toBase64 } from "./signature"
import { rowLimits } from "../preferences/rows"
import { type Candidate, type Kind, kindLabels, kinds } from "./match"
import { experimental_decide as decide } from "ai"
import { convexGateway } from "@convex-dev/ai-sdk-provider"
import { jevModel } from "../workflows/judge"

// Each sealed value is bound to its owner and what it is, so it can't be opened from
// another person's row or passed off as a different field.
export const aad = {
  token: (userId: string) => `email-token:${userId}`,
  details: (userId: string) => `email-details:${userId}`,
  email: (userId: string) => `email:${userId}`,
}

export const keys = () => parseKeys(env.SECRETS_KEYS)

/** Opens a sealed JSON value and checks its shape, or null when it can't be read. */
export const openJson = async <T extends Type>(
  k: Keys,
  sealed: string,
  aadText: string,
  shape: T
) =>
  open(k, sealed, aadText).then(
    (text) => {
      const value = shape(JSON.parse(text))
      return value instanceof type.errors ? null : (value as T["infer"])
    },
    () => null
  )

export const connectionOf = (ctx: QueryCtx, userId: Id<"users">) =>
  ctx.db
    .query("emailConnections")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique()

/** The address to tag for this person, or null until mail to a tagged one would reach them. */
export const trackingAddressOf = async (ctx: QueryCtx, userId: Id<"users">) => {
  const row = await connectionOf(ctx, userId)
  if (!row?.inbound || !row.allow.receive || !row.allow.tag) return null
  const k = await keys().catch(() => null)
  const details = k && (await openJson(k, row.details, aad.details(userId), Details))
  return details ? details.fromAddress : null
}

/** Your preferred name, else your saved full name, else your account's. */
export const signatureInfoOf = async (
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<SignatureInfo> => {
  const user = await ctx.db.get("users", userId)
  const fields = await ctx.db
    .query("profileEntries")
    .withIndex("by_userId_and_kind_and_order", (q) => q.eq("userId", userId).eq("kind", "field"))
    .take(rowLimits.field)
  const saved = fields.find((f) => /\bfull name\b/i.test(f.label))?.value.trim()
  return {
    name: user?.preferredName || saved || user?.name || "",
    email: user?.email ?? "",
    linkedin: user?.linkedin ?? "",
    github: user?.github ?? "",
    x: user?.x ?? "",
  }
}

export const reseal = async (k: Keys, sealedText: string, aadText: string) =>
  seal(k, await open(k, sealedText, aadText), aadText)

// For account deletion: the connection now, the emails in batches.
export const deleteEmail = async (ctx: MutationCtx, userId: Id<"users">) => {
  const connection = await connectionOf(ctx, userId)
  if (connection?.signaturePhoto) await ctx.storage.delete(connection.signaturePhoto)
  if (connection) await ctx.db.delete("emailConnections", connection._id)
  for await (const event of ctx.db
    .query("mailEvents")
    .withIndex("by_userId_and_applicationId", (q) => q.eq("userId", userId)))
    await ctx.db.delete("mailEvents", event._id)
  await ctx.scheduler.runAfter(0, internal.email.removeEmails, { owner: userId })
}

export const limits = new RateLimiter(components.rateLimiter, {
  connectEmail: { kind: "fixed window", rate: 10, period: HOUR },
  testEmail: { kind: "fixed window", rate: 5, period: HOUR },
  setUpInbound: { kind: "fixed window", rate: 5, period: HOUR },
  // Mail written by hand from an application, well above a real day of it.
  sendMail: { kind: "fixed window", rate: 30, period: 24 * HOUR },
  importMail: { kind: "token bucket", rate: 2000, period: HOUR, capacity: 500 },
  plainAddress: { kind: "fixed window", rate: 20, period: HOUR },
  // Enough for a busy job search, low enough that a flood can't fill the table.
  inboundEmail: { kind: "token bucket", rate: 200, period: HOUR, capacity: 50 },
})

export const userIdOf = async (ctx: ActionCtx) => {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Not signed in")
  return userId
}

export const secretKeys = () =>
  keys().catch(() => {
    throw new ConvexError("Email isn't set up on this server yet: SECRETS_KEYS is missing.")
  })

/** The connection with its details and token opened in memory, for an action to use. */
export const openConnection = async (ctx: ActionCtx, userId: Id<"users">) => {
  const row = await ctx.runQuery(internal.email.sealed, { userId })
  if (!row) throw new ConvexError("Connect Cloudflare first.")
  const k = await secretKeys()
  const details = await openJson(k, row.details, aad.details(userId), Details)
  const token = await open(k, row.token, aad.token(userId)).catch(() => null)
  if (!details || !token)
    throw new ConvexError("The saved connection couldn't be read. Paste your token again.")
  return { row, k, details, token }
}

/** Who mail is from, with the person's name when there is one. */
export const senderOf = (address: string, name?: string) => {
  const clean = name?.replace(/[\r\n]+/g, " ").trim()
  return clean ? { address, name: clean } : address
}

/** What to hand to Cloudflare: under your name, and signed if there's a signature to add. */
export const outgoing = async <T extends { from: string; text: string; html?: string }>(
  ctx: ActionCtx,
  row: { signature: SignatureInfo; signaturePhoto?: Id<"_storage"> | undefined },
  email: T,
  { sign = true }: { sign?: boolean } = {}
) => {
  const named = { ...email, from: senderOf(email.from, row.signature.name) }
  if (!sign) return named
  const photo = row.signaturePhoto ? await ctx.storage.get(row.signaturePhoto) : null
  if (!hasSignature(row.signature, Boolean(photo))) return named
  return {
    ...named,
    ...signed(
      email.text,
      row.signature,
      photo ? { base64: toBase64(await photo.arrayBuffer()), type: photo.type } : undefined,
      email.html
    ),
  }
}

export const sha256 = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

export const cloudflare = (cause: unknown) =>
  new ConvexError(`Cloudflare: ${cause instanceof Error ? cause.message : String(cause)}`)

export const tearDown = async (ctx: ActionCtx, userId: Id<"users">) => {
  const { row, details, token } = await openConnection(ctx, userId)
  if (row.inbound && details.zoneId)
    await removeInbound(
      details.accountId,
      details.zoneId,
      token,
      row.inbound.worker,
      row.inbound.ruleId,
      row.inbound.aliasRules
    )
}

export const cap = (text: string | undefined, max: number) => text?.slice(0, max)

/** A Message-ID hashed with its owner, so threads match without storing the ID. */
export const threadKeyOf = async (userId: string, messageId: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${messageId}`))
    )
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

// Two questions in one request: which application, and what the email says. An answer
// Jev isn't at least even on counts as none.
export const askJev = async (
  mail: typeof Received.infer,
  applications: Candidate[]
): Promise<{ application?: Candidate; kind: Kind; sureOfKind: number }> => {
  const options = Object.fromEntries(
    applications.map((a, i) => [`a${i}`, `${a.company}: ${a.role}`])
  )
  const result = await decide({
    model: convexGateway.evaluationModel(jevModel),
    state: {
      email: {
        from: mail.fromName ? `${mail.fromName} <${mail.from}>` : mail.from,
        subject: mail.subject,
        text: (mail.text ?? "").slice(0, 4000),
      },
      applications: Object.values(options),
    },
    questions: {
      application: {
        type: "choice",
        instructions:
          "Which of `applications` (company: role) is `email` about? Pick the one the email names or clearly refers to, or none when it's about none of them.",
        criteria: { ...options, none: "None of these" },
      },
      kind: {
        type: "choice",
        instructions: "What does `email` tell the person about their job application?",
        criteria: kindLabels,
      },
    },
  })
  const answers = result.answers as Record<
    string,
    { choice?: string; probabilities?: Record<string, number> }
  >
  const sure = (a?: { choice?: string; probabilities?: Record<string, number> }) =>
    a?.choice && (a.probabilities?.[a.choice] ?? 0) >= 0.5 ? a.choice : undefined
  const picked = sure(answers.application)
  const kind = sure(answers.kind)
  return {
    application: picked?.startsWith("a") ? applications[Number(picked.slice(1))] : undefined,
    kind: kinds.find((k) => k === kind) ?? "other",
    sureOfKind: kind ? (answers.kind?.probabilities?.[kind] ?? 0) : 0,
  }
}

export const ownEvent = async (ctx: QueryCtx, userId: Id<"users">, eventId: Id<"mailEvents">) => {
  const event = await ctx.db.get("mailEvents", eventId)
  if (event?.userId !== userId) throw new ConvexError("That email isn't yours.")
  return event
}
