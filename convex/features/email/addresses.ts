// Each application's own address: reach+app-12@example.com. Cloudflare's subaddressing
// delivers it on the reach@ rule and keeps the tag where the Worker can read it. Numbers are
// per person, and each person has their own inbound URL, so a tag can't reach anyone else's
// application. Safe to import from the frontend.

export const taggedAddress = (address: string, number: number) => {
  const at = address.lastIndexOf("@")
  return `${address.slice(0, at)}+app-${number}${address.slice(at)}`
}

/** The application number in the addresses an email was sent to, if any. */
export const numberIn = (addresses: string[]) => {
  for (const address of addresses) {
    const tag = /\+app-(\d+)@/i.exec(address)
    if (tag) return Number(tag[1])
  }
  return undefined
}
