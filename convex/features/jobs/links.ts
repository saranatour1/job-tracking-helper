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
  return null
}

// A Greenhouse board can list its roles on the company's own site, with the role's id in gh_jid.
// Greenhouse's page for the role redirects back there, so its embed page is what shows the form.
export const formUrlOf = (url: string, board?: { kind: BoardKind; slug: string } | null) => {
  if (boardOf(url)) return url
  const id = URL.canParse(url) ? new URL(url).searchParams.get("gh_jid") : null
  if (board?.kind !== "greenhouse" || !id || !/^\d+$/.test(id)) return null
  return `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board.slug)}&token=${id}`
}

export const previewOf = (text: string, length = 240) =>
  unmark(text.split("\n\n").slice(1).join(" ") || text)
    .replace(/\s+/g, " ")
    .slice(0, length)
