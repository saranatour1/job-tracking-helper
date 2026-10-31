// Who counts as a contact. Kept free of Convex imports so it's easy to test.

const automatedName =
  /^(no-?reply|do-?not-?reply|donotreply|notifications?|mailer-daemon|postmaster|bounces?|automated|auto-?confirm|system|alerts?|updates?)([.+_-].*)?$/i

// Hiring tools send from their own domains on a company's behalf, and nobody reads these.
const hiringToolDomain =
  /(^|\.)(greenhouse-mail\.io|greenhouse\.io|lever\.co|ashbyhq\.com|myworkday\.com|myworkdayjobs\.com|icims\.com|smartrecruiters\.com|workablemail\.com|personio\.(de|com))$/i

/** A person's address worth keeping: not automated, not a hiring tool, and not your own. */
export const isContact = (address: string, ownAddresses: string[]) => {
  const [local, domain] = address.toLowerCase().split("@")
  if (!local || !domain || automatedName.test(local) || hiringToolDomain.test(domain)) return false
  return !ownAddresses.some((own) => own.toLowerCase().split("@")[1] === domain)
}
