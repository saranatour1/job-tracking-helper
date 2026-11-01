import { Navigate, createFileRoute } from "@tanstack/react-router"

import { Landing } from "@/features/landing/landing"
import { pipelineSearch } from "@/features/tracker/search"
import { useAccess } from "@/hooks/use-access"
import { ogImage, publicHead, site } from "@/lib/seo"

const description =
  "Find open roles that fit, get each application ready and track what you sent, all in one place. You stay in control and press Submit yourself."

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: site.name,
  url: site.url,
  description,
  image: ogImage,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
}

const withKeywords = (head: ReturnType<typeof publicHead>) => ({
  ...head,
  meta: [
    ...head.meta,
    {
      name: "keywords",
      content:
        "job search app, job application tracker, job tracker, job search automation, prefill job applications, Greenhouse jobs, Lever jobs, Ashby jobs, Personio jobs",
    },
  ],
})

// RFC 8288: how an agent reading only the homepage's headers finds the rest. src/lib/discovery.ts
// serves these.
const discoveryLinks = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"',
  '</auth.md>; rel="service-doc"; type="text/markdown"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
].join(", ")

const HomePage = () => {
  const search = Route.useSearch()
  const { inApp } = useAccess()
  return (
    <>
      {/* Keeps old links to the board, like /?app=app-4, working. */}
      {inApp && <Navigate to="/pipeline" search={search} replace />}
      <Landing />
    </>
  )
}

export const Route = createFileRoute("/")({
  validateSearch: pipelineSearch,
  headers: () => ({ Link: discoveryLinks }),
  head: () => ({
    ...withKeywords(
      publicHead({
        title: "Job Tracking Helper | Find roles and prepare applications",
        description,
        path: "/",
      })
    ),
    scripts: [{ type: "application/ld+json", children: JSON.stringify(structuredData) }],
  }),
  component: HomePage,
})
