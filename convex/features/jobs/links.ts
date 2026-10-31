import { unmark } from "../../lib/unmark"
import type { BoardKind } from "./boards"

// Apart from boards.ts so what only reads a link or a preview doesn't load the HTML parser.
export const boardOf = (url: string): { kind: BoardKind; slug: string } | null => {
  if (!URL.canParse(url)) return null
  const u = new URL(url)
  const host = u.hostname.toLowerCase()
  const personio = /^([a-z0-9-]+)\.jobs\.personio\.(de|com)$/.exec(host)
  if (personio?.[1]) return { kind: "personio", slug: personio[1] }
  const slug = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase()
  if (!slug) return null
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io")
    return { kind: "greenhouse", slug }
  if (host === "jobs.lever.co") return { kind: "lever", slug }
  if (host === "jobs.ashbyhq.com") return { kind: "ashby", slug }
  if (host === "apply.workable.com" && slug !== "j") return { kind: "workable", slug }
  if (host === "jobs.smartrecruiters.com" && !["ni", "oneclick-ui"].includes(slug))
    return { kind: "smartrecruiters", slug }
  return null
}

const formKinds: BoardKind[] = ["greenhouse", "lever", "ashby", "personio"]

// Whether the app can read this posting's application form. Other roles can still be
// shortlisted and tracked, and you apply on their own page.
export const canPrepare = (url: string) => {
  const kind = boardOf(url)?.kind
  return kind !== undefined && formKinds.includes(kind)
}

// These don't allow apps to read their pages, and block it anyway, so the app never tries.
// People paste what they see there instead.
const closedSites =
  /(^|\.)(linkedin\.com|xing\.com|experteer\.[a-z.]+|x\.com|twitter\.com|facebook\.com|instagram\.com)$/

export const isClosedSite = (url: string) =>
  URL.canParse(url) && closedSites.test(new URL(url).hostname.toLowerCase())

export const previewOf = (text: string, length = 240) =>
  unmark(text.split("\n\n").slice(1).join(" ") || text)
    .replace(/\s+/g, " ")
    .slice(0, length)
