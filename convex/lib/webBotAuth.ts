import { env } from "../_generated/server"

// Web Bot Auth: signs the app's own requests so a site can tell they're really from it, and
// publishes the public key to check them with. Signing is off until WEB_BOT_AUTH_KEY is set.

const encoder = new TextEncoder()
const base64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const base64url = (bytes: ArrayBuffer) =>
  base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

const signingKey = async () => {
  if (!env.WEB_BOT_AUTH_KEY) return null
  const jwk = JSON.parse(env.WEB_BOT_AUTH_KEY) as { kty: string; crv: string; x: string }
  const thumbprint = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })
  return {
    key: await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]),
    keyid: base64url(await crypto.subtle.digest("SHA-256", encoder.encode(thumbprint))),
    publicKey: { kty: jwk.kty, crv: jwk.crv, x: jwk.x },
  }
}

// RFC 9421: a signature covers each component's line, then the parameters describing them.
const sign = async (
  { key, keyid }: { key: CryptoKey; keyid: string },
  components: [name: string, value: string][],
  tag: string,
  seconds: number
) => {
  const created = Math.floor(Date.now() / 1000)
  const nonce = base64(crypto.getRandomValues(new Uint8Array(32)).buffer)
  const params = `(${components.map(([name]) => name).join(" ")});created=${created};expires=${created + seconds};keyid="${keyid}";alg="ed25519";nonce="${nonce}";tag="${tag}"`
  const lines = [...components, ['"@signature-params"', params]]
  const signature = await crypto.subtle.sign(
    "Ed25519",
    key,
    encoder.encode(lines.map(([name, value]) => `${name}: ${value}`).join("\n"))
  )
  return { "Signature-Input": `sig1=${params}`, Signature: `sig1=:${base64(signature)}:` }
}

// A bad key must never stop the app reading a job feed, so it just goes unsigned.
export const botAuthHeaders = async (url: string): Promise<Record<string, string>> => {
  try {
    const signing = await signingKey()
    if (!signing) return {}
    const agent = `"${env.SITE_URL}"`
    return {
      "Signature-Agent": agent,
      ...(await sign(
        signing,
        [
          ['"@authority"', new URL(url).host],
          ['"signature-agent"', agent],
        ],
        "web-bot-auth",
        60
      )),
    }
  } catch {
    return {}
  }
}

// Convex answers this, and the Worker serves it on the site's own address, which is what's signed.
export const botKeyDirectory = async () => {
  const signing = await signingKey()
  return new Response(JSON.stringify({ keys: signing ? [signing.publicKey] : [] }), {
    headers: {
      "Content-Type": "application/http-message-signatures-directory+json",
      "Cache-Control": "max-age=3600",
      ...(signing &&
        (await sign(
          signing,
          [['"@authority";req', new URL(env.SITE_URL).host]],
          "http-message-signatures-directory",
          3600
        ))),
    },
  })
}
