export const proofs = ["own", "name", "unverified"] as const
export type Proof = (typeof proofs)[number]

/** How a role ties to a company: its board's postings live on the company's site, only the name
 * led to a site, or no site was found. Never a verdict. */
export const proofOf = (
  domain: string | null | undefined,
  link: string | null | undefined
): Proof => (!domain ? "unverified" : link === "postings" ? "own" : "name")

/** ".com" for careers.stripe.com, and ".uk" for hooli.co.uk. */
export const endingOf = (domain: string) => `.${domain.split(".").at(-1)}`

/** Whether a domain already says its company's name, so the name needn't be shown beside it. */
export const domainSaysName = (domain: string, company: string) =>
  domain.split(".")[0] === company.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Roles under their company's site, in the order they came. A role with no site found goes under
 * its company's name, since a name alone can't say two boards are one company. */
export const groupDomains = <T extends { company: string; evidence: { domain: string | null } }>(
  jobs: T[]
) => {
  const domains = new Map<string, T[]>()
  for (const job of jobs) {
    const key = job.evidence.domain ?? job.company
    domains.set(key, [...(domains.get(key) ?? []), job])
  }
  return [...domains.values()]
}

/** The catalog by proof and by domain ending, from each board with roles and its site. */
export const summarize = (boards: { jobs: number; domain?: string; link?: string }[]) => {
  const summary = { domains: 0, own: 0, name: 0, unverified: 0 }
  const domains = new Set<string>()
  const endings = new Map<string, number>()
  for (const { jobs, domain, link } of boards) {
    summary[proofOf(domain, link)] += jobs
    if (!domain) continue
    domains.add(domain)
    const ending = endingOf(domain)
    endings.set(ending, (endings.get(ending) ?? 0) + jobs)
  }
  return {
    ...summary,
    domains: domains.size,
    endings: [...endings]
      .map(([ending, jobs]) => ({ ending, jobs }))
      .sort((a, b) => b.jobs - a.jobs || a.ending.localeCompare(b.ending)),
  }
}
