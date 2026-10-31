// Rules that match an incoming email to an application and say what it's about. They
// run on every email; Jev answers the same two questions instead when the person lets
// it read their mail. Kept free of Convex imports so they're easy to test.
import type { Status } from "../applications/validators"
import { companyTag } from "./addresses"

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

export type Candidate = {
  id: string
  company: string
  role: string
  at: number
  status?: Status
  // The company's name on its job board, from the posting's link.
  alias?: string
}

const companyOf = (a: Candidate) => companyTag(a.company)

// Short slugs would match by accident: "app" is in far too many subjects.
const namesOf = (a: Candidate) =>
  [companyOf(a), ...(a.alias && squash(a.alias).length >= 4 ? [squash(a.alias)] : [])].filter(
    (name) => name.length >= 3
  )

// Mail is most likely about what's still going on, least about what's over.
const stageOf = (status?: Status) =>
  status === "rejected" || status === "withdrawn" ? 2 : status === "saved" ? 1 : 0

/** Among one company's applications: the role named in the subject, else the furthest along. */
const pickAmong = (applications: Candidate[], subject: string) => {
  const said = squash(subject)
  return (
    applications.find((a) => squash(a.role).length >= 3 && said.includes(squash(a.role))) ??
    [...applications].sort((a, b) => stageOf(a.status) - stageOf(b.status) || b.at - a.at)[0]
  )
}

/** The application an email sent to a company's address is about. */
export const tagMatch = <T extends Candidate>(tag: string, subject: string, applications: T[]) =>
  pickAmong(
    applications.filter((a) => companyTag(a.company) === tag),
    subject
  ) as T | undefined

/**
 * The application an email is about when its sender or subject names exactly one
 * company. With several applications at that company, the one whose role is in the
 * subject, else the one furthest along, newest first.
 */
export const ruleMatch = (
  mail: { from: string; fromName?: string; subject: string },
  applications: Candidate[]
) => {
  const domain = mail.from.split("@")[1] ?? ""
  const said = squash(`${mail.fromName ?? ""} ${domain} ${mail.subject}`)
  const named = applications.filter((a) => namesOf(a).some((name) => said.includes(name)))
  if (new Set(named.map(companyOf)).size !== 1) return undefined
  return pickAmong(named, mail.subject)
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

const monthNames = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
]
const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

const hourOf = (hour: string | undefined, minute: string | undefined, half: string | undefined) => {
  if (!hour) return { h: 0, m: 0 }
  let h = Number(hour) % 12
  if (!half) h = Number(hour)
  else if (half.toLowerCase() === "pm") h += 12
  return { h, m: Number(minute ?? 0) }
}

// The zones invites name most, by the abbreviation or word they use.
const zoneNames: Record<string, string> = {
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  pacific: "America/Los_Angeles",
  mt: "America/Denver",
  mst: "America/Denver",
  mdt: "America/Denver",
  mountain: "America/Denver",
  ct: "America/Chicago",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  central: "America/Chicago",
  et: "America/New_York",
  est: "America/New_York",
  edt: "America/New_York",
  eastern: "America/New_York",
  utc: "UTC",
  gmt: "UTC",
  bst: "Europe/London",
  cet: "Europe/Berlin",
  cest: "Europe/Berlin",
  eet: "Europe/Athens",
  eest: "Europe/Athens",
  ist: "Asia/Kolkata",
  sgt: "Asia/Singapore",
  jst: "Asia/Tokyo",
  aest: "Australia/Sydney",
  aedt: "Australia/Sydney",
}

/**
 * The time zone an invite gives right after a time ("10:30 AM PT", "14:00 CET",
 * "2pm (Europe/Berlin)"), as an IANA id. Undefined when it names none.
 */
export const zoneOf = (text: string): string | undefined => {
  const after = /\d(?::\d{2})?\s*(?:am|pm)?\s*\(?\s*([A-Za-z]+(?:\/[A-Za-z_]+)+|[A-Za-z]{2,7})\b/gi
  for (const [, word] of text.matchAll(after)) {
    // Abbreviations only in capitals, so "10:30 et merci" isn't Eastern time.
    const named = word!.length > 4 || word === word!.toUpperCase()
    const zone = word!.includes("/") ? word! : named ? zoneNames[word!.toLowerCase()] : undefined
    if (!zone) continue
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone })
      return zone
    } catch {
      // not a real zone; keep looking
    }
  }
  return undefined
}

/**
 * The time an interview email proposes, as written: "Tue, Nov 4 at 10:00 AM",
 * "November 4, 2026 2pm", "2026-11-04 10:00" or "Tuesday at 10:00" (the next one
 * after it arrived). Returned as that wall-clock time in UTC milliseconds, since the
 * email rarely says its time zone; read it back with UTC getters. Undefined when the
 * email names no date.
 */
export const slotOf = (text: string, receivedAt: number): number | undefined => {
  const received = new Date(receivedAt)
  const time = String.raw`(?:,?\s*(?:at|@|from)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?`
  const iso = new RegExp(String.raw`\b(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?`).exec(text)
  if (iso) {
    const [, y, mo, d, h, mi] = iso
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0))
  }
  const named = new RegExp(
    String.raw`\b(${monthNames.join("|")})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?` +
      time,
    "i"
  ).exec(text)
  if (named) {
    const [, month, day, year, hour, minute, half] = named
    const { h, m } = hourOf(hour, minute, half)
    const mo = monthNames.indexOf(month!.toLowerCase().slice(0, 3))
    let y = year ? Number(year) : received.getUTCFullYear()
    // No year and already past: it's next year's.
    if (!year && Date.UTC(y, mo, Number(day)) < receivedAt - 86_400_000) y++
    return Date.UTC(y, mo, Number(day), h, m)
  }
  const weekday = new RegExp(
    String.raw`\b(${dayNames.join("|")})[a-z]*\s*(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?`,
    "i"
  ).exec(text)
  if (weekday) {
    const [, name, hour, minute, half] = weekday
    const { h, m } = hourOf(hour, minute, half)
    const ahead =
      (dayNames.indexOf(name!.toLowerCase().slice(0, 3)) - received.getUTCDay() + 7) % 7 || 7
    return Date.UTC(
      received.getUTCFullYear(),
      received.getUTCMonth(),
      received.getUTCDate() + ahead,
      h,
      m
    )
  }
}
