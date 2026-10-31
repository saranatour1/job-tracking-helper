const automatedName =
  /^(no-?reply|do-?not-?reply|donotreply|notifications?|mailer-daemon|postmaster|bounces?|automated|auto-?confirm|system|alerts?|updates?)([.+_-].*)?$/i

const hiringToolDomain =
  /(^|\.)(greenhouse-mail\.io|greenhouse\.io|lever\.co|ashbyhq\.com|myworkday\.com|myworkdayjobs\.com|icims\.com|smartrecruiters\.com|workablemail\.com|personio\.(de|com))$/i

export const isContact = (address: string, ownAddresses: string[]) => {
  const [local, domain] = address.toLowerCase().split("@")
  if (!local || !domain || automatedName.test(local) || hiringToolDomain.test(domain)) return false
  return !ownAddresses.some((own) => own.toLowerCase().split("@")[1] === domain)
}

export const byCompany = <T extends { company: string; count: number; lastAt: number }>(
  contacts: readonly T[]
) =>
  [...contacts].sort(
    (a, b) => a.company.localeCompare(b.company) || b.count - a.count || b.lastAt - a.lastAt
  )
