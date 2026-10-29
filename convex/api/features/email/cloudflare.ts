// The Cloudflare API calls that check a pasted token. Sending lives in the
// cloudflareEmail component.
const base = "https://api.cloudflare.com/client/v4"

const call = async (path: string, token: string) => {
  const res = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } })
  const body = (await res.json().catch(() => null)) as {
    success?: boolean
    result?: unknown
  } | null
  return res.ok && body?.success ? (body.result ?? null) : undefined
}

/** "active", "disabled", "expired", or "invalid" when Cloudflare doesn't know the token. */
export const tokenStatus = async (accountId: string, token: string) => {
  // Account-owned tokens verify under the account, user tokens under /user.
  for (const path of [`/accounts/${accountId}/tokens/verify`, "/user/tokens/verify"]) {
    const result = (await call(path, token)) as { status?: string } | undefined
    if (result) return result.status ?? "invalid"
  }
  return "invalid"
}

/** mail.example.com → ["mail.example.com", "example.com"]: the zone is one of these. */
export const zoneNamesOf = (domain: string) => {
  const parts = domain.toLowerCase().split(".")
  return parts.slice(0, -1).map((_, i) => parts.slice(i).join("."))
}

const findZone = async (domain: string, token: string) => {
  for (const name of zoneNamesOf(domain)) {
    const zones = (await call(`/zones?name=${encodeURIComponent(name)}`, token)) as
      | { id: string }[]
      | undefined
    if (zones?.[0]) return zones[0].id
  }
}

// What the token may do beyond sending, so incoming mail can be set up with it later:
// deploy the Worker that receives mail, and add the routing rule that feeds it.
export const accessOf = async (accountId: string, token: string, domain: string) => {
  const zoneId = await findZone(domain, token)
  const [workers, routing, subdomains] = await Promise.all([
    call(`/accounts/${accountId}/workers/scripts`, token),
    zoneId ? call(`/zones/${zoneId}/email/routing/rules`, token) : undefined,
    zoneId ? call(`/zones/${zoneId}/email/sending/subdomains`, token) : undefined,
  ])
  return {
    zoneId,
    access: {
      sending: Array.isArray(subdomains)
        ? (subdomains as { name: string; enabled: boolean }[]).some(
            (s) =>
              s.enabled &&
              (s.name === domain || s.name === `*.${domain.split(".").slice(1).join(".")}`)
          )
        : undefined,
      workers: workers !== undefined,
      routing: routing !== undefined,
    },
  }
}
