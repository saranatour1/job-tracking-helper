import { expect, test } from "vite-plus/test"

import { jobPostingData, scriptJson } from "./structured"

const job = {
  title: "Regional Support Manager",
  company: "Axon",
  location: "Amsterdam, North Holland, Netherlands",
  remote: false,
  postedAt: Date.UTC(2026, 10, 4),
  text: "Regional Support Manager\n\n#### **Your impact**\n\nLead <support> & adoption.",
  facts: { employment: "Full-time" as const },
  evidence: { domain: "axon.com" },
}

test("a role's JobPosting names its company, place, type and date", () => {
  expect(jobPostingData(job, "https://example.com/jobs/1")).toMatchObject({
    "@type": "JobPosting",
    description:
      "<p>Regional Support Manager</p><p>Your impact</p><p>Lead &lt;support&gt; &amp; adoption.</p>",
    datePosted: "2026-11-04T00:00:00.000Z",
    hiringOrganization: { name: "Axon", sameAs: "https://axon.com" },
    jobLocation: { address: { addressLocality: "Amsterdam", addressCountry: "Netherlands" } },
    employmentType: "FULL_TIME",
    directApply: false,
  })
})

test("a remote role says where applicants can be, and no office", () => {
  const data = jobPostingData({ ...job, location: "Belgium-Remote", remote: true }, "u")
  expect(data).toMatchObject({
    jobLocationType: "TELECOMMUTE",
    applicantLocationRequirements: [{ "@type": "Country", name: "Belgium" }],
  })
  expect(data).not.toHaveProperty("jobLocation")
})

test("text from a posting can't close the script tag", () => {
  expect(scriptJson({ text: "</script><script>alert(1)</script>" })).not.toContain("</script>")
})
