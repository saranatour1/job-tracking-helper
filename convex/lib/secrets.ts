export type Keys = { current: string; byVersion: Map<string, CryptoKey> }

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

export const parseKeys = async (raw: string | undefined): Promise<Keys> => {
  const entries = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (!entries.length) throw new Error("SECRETS_KEYS isn't set.")
  const byVersion = new Map<string, CryptoKey>()
  let current = ""
  for (const entry of entries) {
    const [version, material] = entry.split(":")
    if (!version || !/^[a-z0-9]+$/i.test(version) || !material)
      throw new Error("SECRETS_KEYS entries look like v1:<base64 key>.")
    const bytes = fromBase64(material)
    if (bytes.length !== 32) throw new Error(`SECRETS_KEYS key ${version} must be 32 bytes.`)
    byVersion.set(
      version,
      await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"])
    )
    current = version
  }
  return { current, byVersion }
}

export const seal = async (keys: Keys, plaintext: string, aad: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    keys.byVersion.get(keys.current)!,
    new TextEncoder().encode(plaintext)
  )
  return `${keys.current}.${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`
}

export const open = async (keys: Keys, sealed: string, aad: string) => {
  const [version = "", iv = "", data = ""] = sealed.split(".")
  const key = keys.byVersion.get(version)
  if (!key) throw new Error(`No key ${version} in SECRETS_KEYS to open this secret.`)
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv), additionalData: new TextEncoder().encode(aad) },
    key,
    fromBase64(data)
  )
  return new TextDecoder().decode(plain)
}

export const isStale = (keys: Keys, sealed: string) => !sealed.startsWith(`${keys.current}.`)
