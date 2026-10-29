import ReactMarkdown from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

// Posting text as the server keeps it: Markdown made from the board's sanitized HTML, or a
// page's own Markdown for a pasted link. Raw HTML in it is never drawn, and the tree is
// sanitized again here, so a posting can't add scripts or handlers to the page.
export const Markdown = ({ children, className }: { children: string; className?: string }) => (
  <div
    className={cn(
      "text-foreground/90 flex flex-col gap-2 text-[13px] leading-relaxed break-words",
      "[&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-[13px] [&_h3]:font-semibold [&_h4]:font-medium",
      "[&_h1,&_h2,&_h3,&_h4]:text-foreground [&_h1,&_h2,&_h3,&_h4]:mt-2",
      "[&_ul]:list-disc [&_ol]:list-decimal [&_ul,&_ol]:flex [&_ul,&_ol]:flex-col [&_ul,&_ol]:gap-1 [&_ul,&_ol]:ps-5",
      "[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-foreground [&_strong]:font-semibold",
      "[&_blockquote]:text-muted-foreground [&_blockquote]:border-s-2 [&_blockquote]:ps-3",
      "[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_hr]:my-2",
      className
    )}
  >
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      // A pasted page's own Markdown can carry images, which can track who reads them.
      disallowedElements={["img"]}
      unwrapDisallowed
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  </div>
)

/** A role's text without its first lines (title, company and place), which the page
 * already shows. */
export const bodyOf = (text: string) => text.split("\n\n").slice(1).join("\n\n") || text
