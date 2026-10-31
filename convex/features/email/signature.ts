// The signature on mail you write: your photo, name, email and links. Kept free of Convex
// imports so the Account page can preview exactly what goes out.

export type SignatureInfo = {
  name: string
  email: string
  linkedin: string
  github: string
  x: string
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export const toBase64 = (bytes: ArrayBuffer) => {
  let binary = ""
  // In pieces: spreading a whole photo into one call overflows the stack.
  const all = new Uint8Array(bytes)
  for (let i = 0; i < all.length; i += 8192)
    binary += String.fromCharCode(...all.subarray(i, i + 8192))
  return btoa(binary)
}

// A full link, a link without its https://, or just a handle. Always comes out as https, so a
// value can't become some other kind of link.
const linkOf = (value: string, site: string) => {
  const clean = value.trim()
  if (!clean) return null
  const bare = clean.replace(/^https?:\/\//i, "")
  if (bare !== clean || /^[\w-]+\.[a-z]{2,}\//i.test(bare)) return `https://${bare}`
  return site + clean.replace(/^@/, "")
}

export const linksOf = ({ linkedin, github, x }: SignatureInfo) =>
  [
    { label: "LinkedIn", url: linkOf(linkedin, "https://www.linkedin.com/in/") },
    { label: "GitHub", url: linkOf(github, "https://github.com/") },
    { label: "X", url: linkOf(x, "https://x.com/") },
  ].flatMap(({ label, url }) => (url ? [{ label, url }] : []))

/** The signature as HTML. `photo` is where the image comes from, if there is one. */
export const signatureHtml = (info: SignatureInfo, photo?: string) => {
  const linkStyle = 'style="color:#2563eb;text-decoration:none"'
  const items = [
    ...(info.email
      ? [`<a href="mailto:${escape(info.email)}" ${linkStyle}>${escape(info.email)}</a>`]
      : []),
    ...linksOf(info).map(
      ({ label, url }) => `<a href="${escape(url)}" ${linkStyle}>${escape(label)}</a>`
    ),
  ]
  return `<table role="presentation" style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px;color:#111"><tr>${
    photo
      ? `<td style="padding-right:12px"><img src="${escape(photo)}" width="64" height="64" alt="" style="border-radius:50%;display:block"></td>`
      : ""
  }<td>${info.name ? `<strong>${escape(info.name)}</strong><br>` : ""}${items.join(" · ")}</td></tr></table>`
}

/** What a reader sees with images and formatting off. */
export const signatureText = (info: SignatureInfo) =>
  [info.name, info.email, ...linksOf(info).map(({ label, url }) => `${label}: ${url}`)]
    .filter(Boolean)
    .join("\n")

/** Whether there's a signature to add: a bare name and email isn't worth formatting mail for. */
export const hasSignature = (info: SignatureInfo, photo: boolean) =>
  photo || linksOf(info).length > 0

/** The email with its signature. A photo is embedded, so inboxes needn't fetch it. */
export const signed = (
  text: string,
  info: SignatureInfo,
  photo?: { base64: string; type: string }
) => ({
  text: `${text}\n\n-- \n${signatureText(info)}`,
  html: `<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${escape(text)}</div>${signatureHtml(info, photo && "cid:signature-photo")}`,
  ...(photo && {
    attachments: [
      {
        content: photo.base64,
        filename: "signature.jpg",
        type: photo.type,
        disposition: "inline",
        content_id: "signature-photo",
      },
    ],
  }),
})
