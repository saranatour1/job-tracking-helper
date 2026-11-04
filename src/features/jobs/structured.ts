import { countriesOf, placesOf, spacedLocation } from "@convex/features/jobs/dimensions"
import { unmark } from "@convex/lib/unmark"
import type { Facts } from "@convex/features/jobs/validators"

const employmentTypes: Record<NonNullable<Facts["employment"]>, string> = {
  "Full-time": "FULL_TIME",
  "Part-time": "PART_TIME",
  Contract: "CONTRACTOR",
  Internship: "INTERN",
  Temporary: "TEMPORARY",
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

type Posting = {
  title: string
  company: string
  location: string
  remote: boolean
  postedAt: number
  text: string
  facts: Facts | null
  evidence: { domain: string | null }
}

/** schema.org's JobPosting for a role's page, which is what Google reads to list it in its job
 * search. https://developers.google.com/search/docs/appearance/structured-data/job-posting */
export const jobPostingData = (job: Posting, url: string) => {
  const location = spacedLocation(job.location)
  const countries = countriesOf(location)
  const city = placesOf(location, false)[0]
  const remote = job.remote || job.facts?.workMode === "Remote"
  const employment = job.facts?.employment && employmentTypes[job.facts.employment]
  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: unmark(job.text)
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => `<p>${escapeHtml(part)}</p>`)
      .join(""),
    datePosted: new Date(job.postedAt).toISOString(),
    hiringOrganization: {
      "@type": "Organization",
      name: job.company,
      ...(job.evidence.domain && { sameAs: `https://${job.evidence.domain}` }),
    },
    ...(remote && {
      jobLocationType: "TELECOMMUTE",
      ...(countries.length > 0 && {
        applicantLocationRequirements: countries.map((name) => ({ "@type": "Country", name })),
      }),
    }),
    ...((city || (!remote && countries[0])) && {
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          ...(city && { addressLocality: city }),
          ...(countries[0] && { addressCountry: countries[0] }),
        },
      },
    }),
    ...(employment && { employmentType: employment }),
    directApply: false,
    url,
  }
}

/** JSON for a <script> tag, with `<` escaped so text from a posting can't close the tag. */
export const scriptJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c")
