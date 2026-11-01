import { mcpUrl, site } from "@/lib/seo"

// WebMCP: tools a browser's agent can call on this page. They only read about the site and move
// around it, since anything that touches someone's data goes through the MCP server and its scopes.

type Tool = {
  name: string
  description: string
  inputSchema: object
  annotations?: { readOnlyHint: boolean }
  execute: (input: { page?: string }) => { content: { type: "text"; text: string }[] }
}
type ModelContext = {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => unknown
}

const pages: Record<string, string> = {
  home: "/",
  privacy: "/privacy",
  terms: "/terms",
  "sign-in": "/sign-in",
  "sign-up": "/sign-up",
  jobs: "/jobs",
  applications: "/pipeline",
  preferences: "/preferences",
  account: "/account",
}

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
})

const tools = (navigate: (path: string) => void): Tool[] => [
  {
    name: "get_site_info",
    description:
      "What Job Tracking Helper is, the pages it has and the MCP server an agent can connect to. It finds roles and prepares applications, and the person always submits them.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: () =>
      text({ name: site.name, url: site.url, mcpServer: mcpUrl, pages: Object.keys(pages) }),
  },
  {
    name: "open_page",
    description:
      "Open a page of the site in this tab. Pages other than home, privacy, terms, sign-in and sign-up need the person to be signed in.",
    inputSchema: {
      type: "object",
      properties: { page: { type: "string", enum: Object.keys(pages) } },
      required: ["page"],
    },
    execute: ({ page }) => {
      if (page === undefined || !Object.hasOwn(pages, page))
        return text({ error: `There's no page called ${page}` })
      navigate(pages[page])
      return text({ opened: pages[page] })
    },
  },
]

// The API is still experimental, and a browser's version of it must never stop the app starting.
export const registerSiteTools = async (navigate: (path: string) => void) => {
  const { modelContext } = ("modelContext" in document ? document : navigator) as unknown as {
    modelContext?: ModelContext
  }
  if (!modelContext) return
  // Lasts as long as the page: nothing here ever needs to take the tools back.
  const { signal } = new AbortController()
  try {
    await Promise.all(tools(navigate).map((tool) => modelContext.registerTool(tool, { signal })))
  } catch (error) {
    console.warn("WebMCP tools weren't registered", error)
  }
}
