// Each application's own address: reach+app-12@example.com. Cloudflare's subaddressing
// delivers it on the reach@ rule and keeps the tag where the Worker can read it. Numbers are
// per person, and each person has their own inbound URL, so a tag can't reach anyone else's
// application. Safe to import from the frontend.

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

export const taggedAddress = (address: string, number: number) => {
  const { local, domain } = partsOf(address)
  return `${local}+app-${number}${domain}`
}

/** For forms that refuse a plus. Each one needs its own routing rule, so only on request. */
export const addressWithoutPlus = (address: string, number: number) => {
  const { local, domain } = partsOf(address)
  return `${local}.app-${number}${domain}`
}

/** The application number in the addresses an email was sent to, if any. */
export const numberIn = (addresses: string[]) => {
  for (const address of addresses) {
    const tag = /[+.]app-(\d+)@/i.exec(address)
    if (tag) return Number(tag[1])
  }
  return undefined
}

/** The messages in an .mbox export, or the one message in an .eml file. */
export const messagesIn = (file: string) =>
  file
    .split(/^From .*\r?\n/m)
    .map((message) => message.trim())
    .filter(Boolean)
