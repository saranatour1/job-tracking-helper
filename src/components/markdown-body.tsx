import ReactMarkdown from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

// Raw HTML is never drawn, and the tree is sanitized again here, so a posting can't add scripts or
// handlers to the page.
const MarkdownBody = ({ children }: { children: string }) => (
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
)

export default MarkdownBody
