// Rules that match an incoming email to an application and say what it's about. They
// run on every email; Jev answers the same two questions instead when the person lets
// it read their mail. Kept free of Convex imports so they're easy to test.
import type { Status } from "../applications/validators"

export const kinds = ["confirmation", "interview", "rejection", "offer", "portal", "other"] as const
export type Kind = (typeof kinds)[number]

// What each kind means, for Jev's question and the timeline.
export const kindLabels: Record<Kind, string> = {
  confirmation: "They received the application",
  interview: "An invitation to interview, or scheduling one",
  rejection: "They aren't moving forward with the application",
  offer: "A job offer",
  portal: "Asks them to check their status or act on a separate website or portal",
  other: "Something else",
}

// First match wins, so the most decisive news comes first.
const kindRules: [Kind, RegExp][] = [
  ["offer", /pleased to offer|offer (letter|of employment)|extend(ing)? (you )?an offer/i],
  [
    "rejection",
    /unfortunately|not (be )?moving forward|other candidates|decided not to|(won't|will not) be (moving|proceeding)|not been selected/i,
  ],
  ["interview", /\binterview|phone screen|your availability|schedule (a|some) time|next round/i],
  [
    "portal",
    /candidate (portal|home)|log ?in to (view|check|see)|check (the |your )?(application )?status/i,
  ],
  [
    "confirmation",
    /received your application|thanks? (you )?for (applying|your application|your interest)|application (has been |was )?(received|submitted)/i,
  ],
]

export const kindOf = (subject: string, text: string): Kind =>
  kindRules.find(([, rule]) => rule.test(`${subject}\n${text.slice(0, 5000)}`))?.[0] ?? "other"

// The status an email suggests, only when it moves the application along.
export const suggestionOf = (kind: Kind, current: Status): Status | undefined => {
  const next: Partial<Record<Kind, Status>> = {
    confirmation: "applied",
    interview: "interviewing",
    rejection: "rejected",
    offer: "offer",
  }
  const to = next[kind]
  if (!to || to === current) return undefined
  if (to === "applied" && current !== "saved") return undefined
  return to
}

// Sites where companies have candidates track their application.
const portalHosts =
  /(myworkdayjobs\.com|myworkdaysite\.com|icims\.com|taleo\.net|successfactors\.(com|eu)|smartrecruiters\.com|my\.greenhouse\.io|jobvite\.com|oraclecloud\.com|brassring\.com)$/i

const urlsIn = (text: string) =>
  (text.match(/https?:\/\/[^\s"'<>)\]]+/g) ?? []).map((url) => url.replace(/[.,;:!?]+$/, ""))

/** A link to a status portal: a known portal site, or for a portal email its first link. */
export const portalOf = (kind: Kind, text: string, html = "") => {
  const urls = [...urlsIn(text), ...urlsIn(html)].filter((url) => URL.canParse(url))
  return (
    urls.find((url) => portalHosts.test(new URL(url).hostname)) ??
    (kind === "portal" ? urls[0] : undefined)
  )
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "")

export type Candidate = { id: string; company: string; role: string; at: number }

/**
 * The application an email is about when its sender or subject names exactly one
 * company. With several applications at that company, the one whose role is in the
 * subject, else the newest.
 */
export const ruleMatch = (
  mail: { from: string; fromName?: string; subject: string },
  applications: Candidate[]
) => {
  const domain = mail.from.split("@")[1] ?? ""
  const said = squash(`${mail.fromName ?? ""} ${domain} ${mail.subject}`)
  const named = applications.filter(
    (a) => squash(a.company).length >= 3 && said.includes(squash(a.company))
  )
  if (new Set(named.map((a) => squash(a.company))).size !== 1) return undefined
  const subject = squash(mail.subject)
  return (
    named.find((a) => squash(a.role).length >= 3 && subject.includes(squash(a.role))) ??
    [...named].sort((a, b) => b.at - a.at)[0]
  )
}

/** Message-IDs as postal-mime reads them, from a reply's In-Reply-To or References. */
export const messageIdsIn = (header: string | undefined) => header?.match(/<[^<>\s]+>/g) ?? []

/** Readable text from an HTML-only email: no styles or scripts, tags gone, spacing kept sane. */
export const textOfHtml = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()
