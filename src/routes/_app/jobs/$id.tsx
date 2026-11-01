import { createFileRoute, notFound } from "@tanstack/react-router"
import { ConvexHttpClient } from "convex/browser"

import { Posting } from "@/features/jobs/posting"
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
  head: ({ loaderData: job }) =>
    job
      ? publicHead({
          title: `${job.title} at ${job.company} | ${site.name}`,
          description: job.preview || `${job.title} at ${job.company}.`,
          path: `/jobs/${postingText(job)}`,
          image: `${site.url}/jobs/${job._id}/og.png`,
          imageAlt: `${job.title} at ${job.company}`,
        })
      : {},
  component: Page,
})
