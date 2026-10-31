import { rehype } from "rehype"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"

// Job boards send their postings as HTML. It's parsed into a tree, cleaned with GitHub's
// rules (no scripts, styles, event handlers or javascript: links) and no images, which
// can track who reads them, and kept as Markdown: a short string that keeps headings,
// lists and links, which Jev reads and the app draws. The tree is written out here
// rather than with remark, whose entity decoder needs a DOM that Convex doesn't have.
const schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((t) => t !== "img"),
}
const clean = rehype().data("settings", { fragment: true }).use(rehypeSanitize, schema)

type Node = {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: Node[]
}

const escape = (text: string) => text.replace(/[\\`*_[\]<]/g, "\\$&")
const block = (inner: string) => `\n\n${inner.trim()}\n\n`
const inline = (nodes: Node[] = [], depth = 0) => nodes.map((n) => write(n, depth)).join("")
const textOf = (n: Node): string => n.value ?? (n.children ?? []).map(textOf).join("")

const write = (node: Node, depth: number): string => {
  if (node.type === "text") return escape((node.value ?? "").replace(/\s+/g, " "))
  if (node.type !== "element" && node.type !== "root") return ""
  const inner = () => inline(node.children, depth)
  const tag = node.tagName ?? ""
  const heading = /^h([1-6])$/.exec(tag)
  if (heading) return block(`${"#".repeat(Number(heading[1]))} ${inner().trim()}`)
  switch (tag) {
    case "p":
    case "div":
    case "section":
    case "article":
    case "header":
    case "footer":
    case "table":
    case "tr":
      return block(inner())
    case "br":
      return "\n"
    case "hr":
      return block("---")
    case "strong":
    case "b": {
      const text = inner().trim()
      return text ? `**${text}**` : ""
    }
    case "em":
    case "i": {
      const text = inner().trim()
      return text ? `_${text}_` : ""
    }
    case "code":
      return `\`${textOf(node).replace(/`/g, "")}\``
    case "pre":
      return block(`\`\`\`\n${textOf(node).trim()}\n\`\`\``)
    case "a": {
      const href = typeof node.properties?.href === "string" ? node.properties.href : ""
      const text = inner().trim()
      return href && text ? `[${text}](${href.replace(/[()\s]/g, encodeURIComponent)})` : text
    }
    case "blockquote":
      return block(
        inner()
          .trim()
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")
      )
    case "ul":
    case "ol": {
      const items = (node.children ?? []).filter((c) => c.tagName === "li")
      const lines = items.map((item, i) => {
        const marker = tag === "ol" ? `${i + 1}.` : "-"
        const text = inline(item.children, depth + 1)
          .trim()
          .replace(/\n{2,}/g, "\n")
          .replace(/\n/g, `\n${"  ".repeat(depth + 1)}`)
        return `${"  ".repeat(depth)}${marker} ${text}`
      })
      return depth ? `\n${lines.join("\n")}` : block(lines.join("\n"))
    }
    default:
      return inner()
  }
}

export const markdownOf = (html: string) =>
  write(clean.runSync(clean.parse(html)) as unknown as Node, 0)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

export const unmark = (markdown: string) =>
  markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]{0,3}(#{1,6}|[-*+]|\d+\.|>)[ \t]+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, "$1")
