import { Navigate, createFileRoute } from "@tanstack/react-router"
import { Authenticated } from "convex/react"

import { Landing } from "@/features/landing/landing"
import { pipelineSearch } from "@/features/tracker/search"
import { publicHead, site } from "@/lib/seo"

const description =
  "Find open roles that fit, get each application ready and track what you sent, all in one place. You stay in control and press Submit yourself."

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: site.name,
  url: site.url,
  description,
  image: `${site.url}/og.png`,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  author: { "@type": "Person", name: site.author },
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

const HomePage = () => {
  const search = Route.useSearch()
  return (
    <>
      <Authenticated>
        {/* Keeps old links to the board, like /?app=app-4, working. */}
        <Navigate to="/pipeline" search={search} replace />
      </Authenticated>
      <Landing />
    </>
  )
}

export const Route = createFileRoute("/")({
  validateSearch: pipelineSearch,
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
