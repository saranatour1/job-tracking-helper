import { describe, expect, it } from "vite-plus/test"

import {
  kindOf,
  messageIdsIn,
  portalOf,
  ruleMatch,
  slotOf,
  suggestionOf,
  textOfHtml,
} from "./match"

const apps = [
  { id: "a", company: "Acme", role: "Frontend Engineer", at: 1 },
  { id: "b", company: "Acme", role: "Designer", at: 2 },
  { id: "c", company: "Globex Corp", role: "Data Analyst", at: 3 },
]

describe("kindOf", () => {
  it("reads the most decisive news first", () => {
    expect(kindOf("Your application", "Unfortunately we won't schedule an interview.")).toBe(
      "rejection"
    )
    expect(kindOf("Next steps", "We'd love to set up an interview.")).toBe("interview")
    expect(kindOf("Thanks for applying", "")).toBe("confirmation")
    expect(kindOf("Update", "Log in to view your status on our candidate portal.")).toBe("portal")
    expect(kindOf("Hello", "Just checking in.")).toBe("other")
  })
})

describe("suggestionOf", () => {
  it("only suggests a status that moves the application along", () => {
    expect(suggestionOf("rejection", "applied")).toBe("rejected")
    expect(suggestionOf("interview", "interviewing")).toBeUndefined()
    expect(suggestionOf("confirmation", "saved")).toBe("applied")
    expect(suggestionOf("confirmation", "interviewing")).toBeUndefined()
    expect(suggestionOf("portal", "applied")).toBeUndefined()
  })
})

describe("portalOf", () => {
  it("prefers a known portal and trims punctuation", () => {
    expect(
      portalOf("other", "See https://acme.com/blog and https://acme.wd5.myworkdayjobs.com/x.")
    ).toBe("https://acme.wd5.myworkdayjobs.com/x")
  })
  it("takes the first link only for a portal email", () => {
    expect(portalOf("portal", "Check https://careers.acme.com/status")).toBe(
      "https://careers.acme.com/status"
    )
    expect(portalOf("other", "Read https://careers.acme.com/blog")).toBeUndefined()
  })
})

describe("ruleMatch", () => {
  it("matches the company named by the sender, by role when there are several", () => {
    expect(
      ruleMatch({ from: "jobs@acme.com", subject: "Your Designer application" }, apps)?.id
    ).toBe("b")
    expect(
      ruleMatch({ from: "no-reply@ashbyhq.com", fromName: "Acme", subject: "Hi" }, apps)?.id
    ).toBe("b")
    expect(
      ruleMatch({ from: "x@greenhouse.io", subject: "Globex Corp: Data Analyst" }, apps)?.id
    ).toBe("c")
  })
  it("leaves it unmatched when no company or several companies are named", () => {
    expect(ruleMatch({ from: "x@example.com", subject: "Hello" }, apps)).toBeUndefined()
    expect(
      ruleMatch({ from: "x@example.com", subject: "Acme and Globex Corp" }, apps)
    ).toBeUndefined()
  })
})

describe("messageIdsIn", () => {
  it("reads every Message-ID from a References header", () => {
    expect(messageIdsIn("<a1@acme.example> <b2@mail.acme.example>")).toEqual([
      "<a1@acme.example>",
      "<b2@mail.acme.example>",
    ])
    expect(messageIdsIn(undefined)).toEqual([])
  })
})

describe("textOfHtml", () => {
  it("keeps the words and line breaks, drops styles and tags", () => {
    expect(
      textOfHtml("<style>p{color:red}</style><p>Hi &amp; welcome</p><p>Next<br>line</p>")
    ).toBe("Hi & welcome\nNext\nline")
  })
})

describe("slotOf", () => {
  // Thursday, October 29 2026.
  const received = Date.UTC(2026, 9, 29, 9)
  const at = (slot: number | undefined) => slot && new Date(slot).toISOString().slice(0, 16)

  it("reads a named date and time", () => {
    expect(at(slotOf("Can you do Tue, Nov 3 at 10:30 AM?", received))).toBe("2026-11-03T10:30")
    expect(at(slotOf("November 4, 2026 2pm works", received))).toBe("2026-11-04T14:00")
  })
  it("reads an ISO time", () => {
    expect(at(slotOf("Slot: 2026-11-05 15:00", received))).toBe("2026-11-05T15:00")
  })
  it("takes the next weekday for 'Tuesday at 10:00'", () => {
    expect(at(slotOf("Your slot is Tuesday at 10:00.", received))).toBe("2026-11-03T10:00")
  })
  it("rolls a past date with no year into next year", () => {
    expect(at(slotOf("Jan 6 at 9am", received))).toBe("2027-01-06T09:00")
  })
  it("finds nothing without a date", () => {
    expect(slotOf("We'd love to talk next week.", received)).toBeUndefined()
  })
})
