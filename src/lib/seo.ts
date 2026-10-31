import ogPath from "@/assets/og.png"

export const site = {
  name: "Job Tracking Helper",
  url: "https://ye.saranatour.dev",
  contact: "privacy@saranatour.dev",
  updated: "October 31, 2026",
  databuddyId: "8ed4f691-f76a-400e-b1fb-a9233678940e",
}

// Link previews cache by URL, so the built file name has to change whenever the image does.
export const ogImage = `${site.url}${ogPath}`

// Crawlers only index a page that asks for it, so a new route stays private by default.
export const publicHead = ({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}) => ({
  meta: [
    { title },
    { name: "description", content: description },
    { name: "robots", content: "index, follow" },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: site.name },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: `${site.url}${path}` },
    { property: "og:image", content: ogImage },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    {
      property: "og:image:alt",
      content: "It finds the jobs and fills in the forms. You press Submit.",
    },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImage },
  ],
  links: [{ rel: "canonical", href: `${site.url}${path}` }],
})
