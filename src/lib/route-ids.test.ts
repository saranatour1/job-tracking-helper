import { describe, expect, it } from "vite-plus/test"

import { dateText, postingId, postingText, routeIds, routeText } from "./route-ids"

describe("postingText", () => {
  it("reads as words and gives back the id, with or without them", () => {
    const text = postingText({ _id: "k57abc", title: "Staff Engineer", company: "Figma" })
    expect(text).toBe("staff-engineer-figma-k57abc")
    expect(postingId(text)).toBe("k57abc")
    expect(postingId("k57abc")).toBe("k57abc")
  })
})

describe("routeText", () => {
  it("makes regular text", () => {
    expect(routeText("Software Engineer · Figma")).toBe("software-engineer-figma")
    expect(routeText("Crème Brûlée & Co.")).toBe("creme-brulee-co")
  })

  it("always has something to show, and isn't endless", () => {
    expect(routeText("···")).toBe("item")
    expect(routeText("日本語")).toBe("item")
    expect(routeText("a ".repeat(100)).length).toBeLessThanOrEqual(80)
    expect(routeText("a ".repeat(100)).endsWith("-")).toBe(false)
  })
})

describe("dateText", () => {
  it("reads as a date", () => {
    expect(dateText(new Date(2026, 9, 31, 15, 10).getTime())).toBe("oct-31-3-10-pm")
  })
})

describe("routeIds", () => {
  const rows = [
    { id: "b", name: "Hooli" },
    { id: "a", name: "Hooli" },
    { id: "c", name: "Acme" },
  ]
  const routes = routeIds(
    rows,
    (r) => r.id,
    (r) => r.name
  )

  it("goes both ways, numbering repeats whatever the list's order", () => {
    expect(routes.text("a")).toBe("hooli")
    expect(routes.text("b")).toBe("hooli-2")
    expect(routes.id("hooli-2")).toBe("b")
    expect(routes.id("acme")).toBe("c")
    const reversed = routeIds(
      [...rows].reverse(),
      (r) => r.id,
      (r) => r.name
    )
    expect(reversed.text("b")).toBe("hooli-2")
  })

  it("still finds a real id, and keeps the id of a row it doesn't have", () => {
    expect(routes.id("c")).toBe("c")
    expect(routes.id("nothing")).toBeUndefined()
    expect(routes.text("nothing")).toBe("nothing")
  })
})
