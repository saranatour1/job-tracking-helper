// A real-looking address per company: jobs+hooli@example.com. Cloudflare's subaddressing
// delivers it on the jobs@ rule and keeps the tag where the Worker can read it. Each person has
// their own inbound URL, so a tag can't reach anyone else's application. Safe to import from
// the frontend.

const partsOf = (address: string) => {
  const at = address.lastIndexOf("@")
  // An address can already have a tag. A second one wouldn't match any rule.
  return { local: address.slice(0, at).split("+")[0]!, domain: address.slice(at) }
}

/** The address with any tag taken off, which is what Cloudflare's rule has to match. */
export const baseAddress = (address: string) => {
  const { local, domain } = partsOf(address)
  return local + domain
}

const legalSuffix = /[,\s]+(inc|llc|ltd|limited|gmbh|ag|corp|corporation|co|plc|bv|srl)\.?$/i

/** A company's name as one lowercase word: "Acme, Inc." is "acme". Empty if nothing's left. */
export const companyTag = (company: string) =>
  company
    .replace(legalSuffix, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 40)

/** jobs+hooli@example.com, or the plain address for a name with no letters to use. */
export const companyAddress = (address: string, company: string) => {
  const { local, domain } = partsOf(address)
  const tag = companyTag(company)
  return tag ? `${local}+${tag}${domain}` : baseAddress(address)
}

/** For forms that refuse a plus. Each one needs its own routing rule, so only on request. */
export const addressWithoutPlus = (address: string, company: string) => {
  const { local, domain } = partsOf(address)
  const tag = companyTag(company)
  return tag ? `${local}.${tag}${domain}` : baseAddress(address)
}

/** The company tag in the addresses an email was sent to, if any. */
export const tagIn = (addresses: string[]) => {
  for (const address of addresses) {
    const tag = /\+([^@]+)@/.exec(address)?.[1] ?? /^[^@.]+\.([a-z0-9]+)@/i.exec(address)?.[1]
    if (tag) return tag.toLowerCase()
  }
  return undefined
}

/** The messages in an .mbox export, or the one message in an .eml file. */
export const messagesIn = (file: string) =>
  file
    .split(/^From .*\r?\n/m)
    .map((message) => message.trim())
    .filter(Boolean)
