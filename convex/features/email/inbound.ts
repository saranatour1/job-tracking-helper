// Incoming mail: Email Routing sends mail for the person's address to a small Worker
// in their Cloudflare account, which posts the raw message here. It's parsed, sealed
// and kept in the cloudflareEmail component, all only if they allowed it.
import { ConvexError, v } from "convex/values"
import { components, internal } from "../../_generated/api"
import { action, env, httpAction } from "../../_generated/server"
import { arkToConvex, checked } from "../../lib/ark"
import { authedQuery } from "../../lib/functions"
import { seal } from "../../lib/secrets"
import { baseAddress, numberIn } from "./addresses"
import { kindOf, messageIdsIn, portalOf, slotOf, zoneOf } from "./match"
import { createRule, removeInbound, routingEnabled, ruleFor, uploadWorker } from "./cloudflare"
import {
  aad,
  keys,
  openJson,
  limits,
  userIdOf,
  secretKeys,
  openConnection,
  sha256,
  threadKeyOf,
  cloudflare,
  tearDown,
} from "./utils"
import { parseMail } from "./parse"
import { Received, SetUpInbound, vRecentMail } from "./validators"

// Deploys the Worker and adds the routing rule for the sending address. Routing must
// already be on: turning it on replaces the domain's MX records, which would cut off
// any other mailbox on the domain, so that stays the person's call.
const setUpInbound = action({
  args: arkToConvex(SetUpInbound),
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await userIdOf(ctx)
    const { forwardTo } = checked(SetUpInbound, args)
    const { row, k, details, token } = await openConnection(ctx, userId)
    if (!row.allow.setup || !row.allow.receive)
      throw new ConvexError("Turn on “Set up Cloudflare for you” and “Keep incoming mail” first.")
    const { ok } = await limits.limit(ctx, "setUpInbound", { key: userId })
    if (!ok) throw new ConvexError("Too many tries. Wait an hour and try again.")
    const domain = details.fromAddress.split("@")[1]!
    if (!details.zoneId)
      throw new ConvexError(
        `${domain} isn't in this Cloudflare account, or the token can't read it.`
      )
    if ((await routingEnabled(details.zoneId, token)) === false)
      throw new ConvexError(
        `Turn on Email Routing for ${domain} in Cloudflare first. It replaces the domain's MX records, so only do it if no other mailbox uses ${domain}.`
      )
    // Two rules for one address don't both run, so one already there would quietly win.
    const base = baseAddress(details.fromAddress)
    const addresses = base === details.fromAddress ? [base] : [details.fromAddress, base]
    for (const address of addresses) {
      const taken = await ruleFor(details.zoneId, token, address)
      if (taken && taken.id !== row.inbound?.ruleId && !row.inbound?.aliasRules?.includes(taken.id))
        throw new ConvexError(
          `A routing rule in Cloudflare already handles ${address}${taken.forwardsTo ? `, sending it to ${taken.forwardsTo}` : ""}. Delete that rule, then set up again${taken.forwardsTo ? ` with ${taken.forwardsTo} under “Also forward to”, so it keeps getting your mail` : ""}.`
        )
    }
    const inboundId = crypto.randomUUID()
    const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    const worker = `job-tracking-helper-${inboundId.slice(0, 8)}`
    let ruleId: string
    const baseRule: string[] = []
    try {
      await uploadWorker(details.accountId, token, worker, {
        inboundUrl: `${env.CONVEX_SITE_URL}/email/inbound/${inboundId}`,
        secret,
        forwardTo,
      })
      ruleId = await createRule(details.zoneId, token, details.fromAddress, worker)
      // Tagged addresses are matched by the address with no tag at all.
      if (base !== details.fromAddress)
        baseRule.push(await createRule(details.zoneId, token, base, worker))
    } catch (cause) {
      await removeInbound(details.accountId, details.zoneId, token, worker, "")
      throw cloudflare(cause)
    }
    // A previous setup's rule and Worker go once the new ones are in place.
    if (row.inbound)
      await removeInbound(
        details.accountId,
        details.zoneId,
        token,
        row.inbound.worker,
        row.inbound.ruleId,
        row.inbound.aliasRules
      )
    await ctx.runMutation(internal.email.setInbound, {
      userId,
      inboundId,
      inbound: {
        secretHash: await sha256(secret),
        worker,
        ruleId,
        at: Date.now(),
        ...(baseRule.length && { aliasRules: baseRule }),
      },
      details: await seal(k, JSON.stringify({ ...details, forwardTo }), aad.details(userId)),
    })
    return null
  },
})

const stopInbound = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await userIdOf(ctx)
    await tearDown(ctx, userId)
    await ctx.runMutation(internal.email.setInbound, { userId })
    return null
  },
})

// Removes the Worker and rule first, so mail isn't sent to a URL that no longer
// answers. A connection that can't be opened is deleted anyway.
const disconnect = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await userIdOf(ctx)
    await tearDown(ctx, userId).catch(() => null)
    await ctx.runMutation(internal.email.remove, { userId })
    return null
  },
})

// POST /email/inbound/<inboundId>, called by the person's Worker. A 4xx makes the
// Worker turn the message away; a 5xx makes Cloudflare try again later.
export const receive = httpAction(async (ctx, req) => {
  const inboundId = new URL(req.url).pathname.split("/").pop() ?? ""
  const target = await ctx.runQuery(internal.email.inboundTarget, { inboundId })
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? ""
  // Comparing hashes: the secret is random, so how long the comparison takes says nothing.
  if (!target || (await sha256(bearer)) !== target.secretHash)
    return new Response("Unknown inbound address", { status: 401 })
  if (!target.receive) return new Response("Not receiving mail", { status: 403 })
  const { ok } = await limits.limit(ctx, "inboundEmail", { key: target.userId })
  if (!ok) return new Response("Too much mail at once", { status: 503 })
  const email = await parseMail(await req.arrayBuffer(), {
    from: req.headers.get("X-Envelope-From"),
    to: req.headers.get("X-Envelope-To"),
  })
  const k = await secretKeys()
  const emailId = await ctx.runMutation(components.cloudflareEmail.lib.receive, {
    owner: target.userId,
    payload: await seal(k, JSON.stringify(email), aad.email(target.userId)),
  })
  await ctx.scheduler.runAfter(0, internal.email.sortMail, { userId: target.userId, emailId })
  return new Response(null, { status: 204 })
})

// The newest incoming mail, opened for its owner: who it's from, the subject and a
// line of the text.
const recentMail = authedQuery({
  args: {},
  returns: vRecentMail,
  handler: async (ctx) => {
    const k = await keys().catch(() => null)
    if (!k) return []
    const emails = await ctx.runQuery(components.cloudflareEmail.lib.list, {
      owner: ctx.userId,
      direction: "inbound",
      limit: 10,
    })
    const opened = await Promise.all(
      emails.map(async (email) => {
        const mail = await openJson(k, email.payload, aad.email(ctx.userId), Received)
        return (
          mail && {
            id: email._id,
            from: mail.fromName || mail.from,
            subject: mail.subject || "(no subject)",
            snippet: (mail.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140),
            at: email._creationTime,
          }
        )
      })
    )
    return opened.filter((mail) => mail !== null)
  },
})

// One email from a file, for mail that came before incoming mail was set up. Kept only when it
// matches an application by its address, thread or name, so importing a whole mailbox can't
// fill Unsorted. It uses no AI, so it costs nothing however many there are, and being old news
// it adds no Inbox line, workflow event or suggestion.
const importMail = action({
  args: { raw: v.string() },
  returns: v.union(v.literal("filed"), v.literal("known"), v.literal("unmatched")),
  handler: async (ctx, { raw }) => {
    const userId = await userIdOf(ctx)
    const row = await ctx.runQuery(internal.email.sealed, { userId })
    if (!row) throw new ConvexError("Connect Cloudflare first.")
    if (!row.allow.receive) throw new ConvexError("Turn on “Keep incoming mail” first.")
    const { ok } = await limits.limit(ctx, "importMail", { key: userId })
    if (!ok) throw new ConvexError("That's a lot of mail at once. Wait an hour and try the rest.")
    const k = await secretKeys()
    const mail = await parseMail(raw)
    const messageKey = mail.messageId ? await threadKeyOf(userId, mail.messageId) : undefined
    if (messageKey && (await ctx.runQuery(internal.email.knownMessage, { userId, messageKey })))
      return "known"
    const application = await ctx.runQuery(internal.email.importTarget, {
      userId,
      number: numberIn(mail.to),
      threadKeys: await Promise.all(
        [...messageIdsIn(mail.references), ...messageIdsIn(mail.inReplyTo)].map((id) =>
          threadKeyOf(userId, id)
        )
      ),
      mail: {
        from: mail.from,
        subject: mail.subject,
        ...(mail.fromName && { fromName: mail.fromName }),
      },
    })
    if (!application) return "unmatched"
    const emailId = await ctx.runMutation(components.cloudflareEmail.lib.receive, {
      owner: userId,
      payload: await seal(k, JSON.stringify(mail), aad.email(userId)),
    })
    const at = mail.date ? Date.parse(mail.date) || Date.now() : Date.now()
    const text = mail.text ?? ""
    const kind = kindOf(mail.subject, text)
    await ctx.runMutation(internal.email.record, {
      event: {
        userId,
        emailId,
        applicationId: application,
        kind,
        at,
        note: await seal(
          k,
          JSON.stringify({
            from: mail.fromName || mail.from,
            subject: mail.subject,
            portalUrl: portalOf(kind, text, mail.html),
            ...(kind === "interview" && {
              slot: slotOf(`${mail.subject}\n${text}`, at),
              slotZone: zoneOf(`${mail.subject}\n${text}`),
            }),
          }),
          aad.email(userId)
        ),
        ...(messageKey && { messageKey }),
        by: "rules",
      },
      move: false,
      quiet: true,
    })
    return "filed"
  },
})

export const inboundApi = { setUpInbound, stopInbound, disconnect, recentMail, importMail }
