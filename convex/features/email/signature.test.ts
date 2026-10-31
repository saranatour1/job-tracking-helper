import { describe, expect, it } from "vite-plus/test"

import { hasSignature, linksOf, signatureHtml, signatureText, signed } from "./signature"

const info = { name: "Sara Natour", email: "reach@example.com", linkedin: "", github: "", x: "" }

describe("signature links", () => {
  it("takes a full link, a link with no https, or a handle", () => {
    const urls = (linkedin: string, github: string, x: string) =>
      linksOf({ ...info, linkedin, github, x }).map((l) => l.url)
    expect(urls("https://www.linkedin.com/in/sara", "sara", "@sara")).toEqual([
      "https://www.linkedin.com/in/sara",
      "https://github.com/sara",
      "https://x.com/sara",
    ])
    expect(urls("linkedin.com/in/sara", "", "")).toEqual(["https://linkedin.com/in/sara"])
    expect(urls("http://www.linkedin.com/in/sara", "", "")).toEqual([
      "https://www.linkedin.com/in/sara",
    ])
  })

  it("can't be turned into another kind of link", () => {
    const [link] = linksOf({ ...info, github: "javascript:alert(1)" })
    expect(link?.url).toBe("https://github.com/javascript:alert(1)")
  })

  it("leaves out what isn't set", () => {
    expect(linksOf(info)).toEqual([])
  })
})

describe("the signature", () => {
  it("escapes what you typed", () => {
    const html = signatureHtml({ ...info, name: 'A <b>"x"</b>', github: 'a"><script>' })
    expect(html).not.toContain("<b>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("A &lt;b&gt;&quot;x&quot;&lt;/b&gt;")
  })

  it("has a plain text version with each link written out", () => {
    expect(signatureText({ ...info, github: "sara" })).toBe(
      "Sara Natour\nreach@example.com\nGitHub: https://github.com/sara"
    )
  })

  it("is only added with a photo or a link", () => {
    expect(hasSignature(info, false)).toBe(false)
    expect(hasSignature(info, true)).toBe(true)
    expect(hasSignature({ ...info, x: "sara" }, false)).toBe(true)
  })

  it("embeds a photo, and needs no attachment without one", () => {
    const withPhoto = signed("Hi", info, { base64: "AAAA", type: "image/jpeg" })
    expect(withPhoto.html).toContain('src="cid:signature-photo"')
    expect(withPhoto.attachments).toHaveLength(1)
    const without = signed("Hi", { ...info, x: "sara" })
    expect(without.html).not.toContain("<img")
    expect(without).not.toHaveProperty("attachments")
  })
})
