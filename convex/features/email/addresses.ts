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

export const companyTag = (company: string) =>
  company
    .replace(legalSuffix, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 40)

export const companyAddress = (address: string, company: string) => {
  const { local, domain } = partsOf(address)
  const tag = companyTag(company)
  return tag ? `${local}+${tag}${domain}` : baseAddress(address)
}

export const addressWithoutPlus = (address: string, company: string) => {
  const { local, domain } = partsOf(address)
  const tag = companyTag(company)
  return tag ? `${local}.${tag}${domain}` : baseAddress(address)
}

export const tagIn = (addresses: string[]) => {
  for (const address of addresses) {
    const tag = /\+([^@]+)@/.exec(address)?.[1] ?? /^[^@.]+\.([a-z0-9]+)@/i.exec(address)?.[1]
    if (tag) return tag.toLowerCase()
  }
  return undefined
}

export const messagesIn = (file: string) =>
  file
    .split(/^From .*\r?\n/m)
    .map((message) => message.trim())
    .filter(Boolean)
