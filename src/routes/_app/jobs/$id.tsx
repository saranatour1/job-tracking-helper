import { createFileRoute, notFound } from "@tanstack/react-router"
import { ConvexHttpClient } from "convex/browser"

import { Posting } from "@/features/jobs/posting"
import { jobPostingData, scriptJson } from "@/features/jobs/structured"
import { api } from "@/lib/api"
import { postingId, postingText } from "@/lib/route-ids"
import { publicHead, site } from "@/lib/seo"

const Page = () => <Posting job={Route.useLoaderData()} />

export const Route = createFileRoute("/_app/jobs/$id")({
  // On the server too, since link previews read the page's head and don't run its scripts.
  loader: async ({ params }) => {
    const job = await new ConvexHttpClient(String(import.meta.env.VITE_CONVEX_URL)).query(
      api.jobs.posting,
      { id: postingId(params.id) }
    )
    if (!job) throw notFound()
    return job
  },
  head: ({ loaderData: job }) => {
    if (!job) return {}
    const page = `${site.url}/jobs/${postingText(job)}`
    const head = publicHead({
      title: `${job.title} at ${job.company} | ${site.name}`,
      description: job.summary || job.preview || `${job.title} at ${job.company}.`,
      path: `/jobs/${postingText(job)}`,
      image: `${site.url}/jobs/${job._id}/og.png`,
      imageAlt: `${job.title} at ${job.company}`,
    })
    return {
      ...head,
      scripts: [{ type: "application/ld+json", children: scriptJson(jobPostingData(job, page)) }],
    }
  },
  component: Page,
})
