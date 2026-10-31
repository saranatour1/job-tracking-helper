import { describe, expect, it } from "vite-plus/test"

import { type Answer, type FormField, planFor, questionsFor, resolve } from "./match"

const field = (label: string, more: Partial<FormField> = {}): FormField => ({
  selector: `#${label.toLowerCase().replace(/\W+/g, "-")}`,
  name: label.toLowerCase().replace(/\W+/g, "_"),
  type: "text",
  label,
  required: true,
  ...more,
})

const answers: Answer[] = [
  { key: "name", label: "Full name", value: "Sara Natour" },
  { key: "email", label: "Email", value: "sara@example.com" },
  { key: "phone", label: "Phone", value: "+962 79 123 4567" },
  { key: "visa", label: "Visa sponsorship", value: "No sponsorship needed" },
  { key: "why", label: "Why do you want to work here?", value: "I like small teams." },
]

describe("planFor", () => {
  it("fills plain fields by synonym, derives first and last name, and uploads the resume", () => {
    const plan = planFor(
      [
        field("First Name"),
        field("Last Name"),
        field("Email Address", { type: "email" }),
        field("Phone"),
        field("Resume/CV", { type: "file" }),
        field("I agree to the privacy policy", { type: "checkbox" }),
      ],
      answers
    )
    expect(plan.fills.map((f) => [f.selector, f.value, f.key])).toEqual([
      ["#first-name", "Sara", "name"],
      ["#last-name", "Natour", "name"],
      ["#email-address", "sara@example.com", "email"],
      ["#phone", "+962 79 123 4567", "phone"],
    ])
    expect(plan.upload).toBe("#resume-cv")
    expect(plan.consent).toEqual(["#i-agree-to-the-privacy-policy"])
    expect(plan.ask).toEqual([])
  })

  it("leaves demographic and cover letter fields blank, and asks Jev about the rest", () => {
    const plan = planFor(
      [
        field("Gender", { type: "select", options: ["Female", "Male", "Decline"] }),
        field("Cover letter", { type: "textarea", required: false }),
        field("Do you require visa sponsorship?", { type: "select", options: ["Yes", "No"] }),
        field("Why do you want to join?", { type: "textarea" }),
      ],
      answers
    )
    expect(plan.skipped).toEqual(["Gender", "Cover letter"])
    expect(plan.ask.map((f) => f.label)).toEqual([
      "Do you require visa sponsorship?",
      "Why do you want to join?",
    ])
  })
})

describe("planFor on real forms", () => {
  it("finds Greenhouse's resume by its id, and leaves its cover letter out", () => {
    const plan = planFor(
      [
        field("Attach", { selector: "#resume", name: "resume", type: "file" }),
        field("Attach", { selector: "#cover_letter", name: "cover_letter", type: "file" }),
      ],
      answers
    )
    expect(plan.upload).toBe("#resume")
    expect(plan.skipped).toEqual(["Attach"])
  })

  it("leaves every demographic question blank, however it's worded", () => {
    const options = ["Yes", "No"]
    const labels = ["Disability status", "Ethnicity", "Veteran status", "Race", "EEOC survey"]
    const plan = planFor(
      labels.map((l) => field(l, { type: "custom", options })),
      answers
    )
    expect(plan.skipped).toEqual(labels)
    expect(plan.ask).toEqual([])
  })

  it("asks instead of filling a blank last name from a one-word full name", () => {
    const plan = planFor(
      [field("First Name"), field("Last Name")],
      [{ key: "name", label: "Full name", value: "Sara" }]
    )
    expect(plan.fills.map((f) => f.value)).toEqual(["Sara"])
    expect(plan.ask.map((f) => f.label)).toEqual(["Last Name"])
  })

  it("keeps where you want to work apart from where you are", () => {
    const saved = [
      { key: "wants", label: "Preferred locations", value: "Berlin, Lisbon" },
      { key: "country", label: "Country", value: "Germany" },
      { key: "city", label: "City", value: "Hannover" },
    ]
    const plan = planFor(
      [
        field("Location (City)", { type: "custom" }),
        field("Country", { type: "custom" }),
        field("Are you authorized to work in the country where you are applying?", {
          type: "yesno",
          options: ["Yes", "No"],
        }),
      ],
      saved
    )
    expect(plan.fills.map((f) => f.value)).toEqual(["Hannover", "Germany"])
    expect(plan.ask.map((f) => f.type)).toEqual(["yesno"])
  })

  it("tries the country when a location list has no such city", () => {
    const [fill] = planFor(
      [field("Location", { type: "custom" })],
      [
        { key: "city", label: "City", value: "Berlin" },
        { key: "country", label: "Country", value: "Germany" },
      ]
    ).fills
    expect([fill?.value, fill?.fallback]).toEqual(["Berlin", "Germany"])
  })

  it("takes a saved answer that is one of the options, and asks Jev about one that isn't", () => {
    const options = ["Yes", "No"]
    const plan = planFor(
      [
        field("Salary", { type: "select", options: ["60,000 EUR", "70,000 EUR"] }),
        field("Visa", { type: "custom", options }),
      ],
      [
        { key: "pay", label: "Salary", value: "60,000 eur" },
        { key: "visa", label: "Visa", value: "None needed in the EU" },
      ]
    )
    expect(plan.fills.map((f) => f.value)).toEqual(["60,000 EUR"])
    expect(plan.ask.map((f) => f.label)).toEqual(["Visa"])
  })
})

describe("questionsFor and resolve", () => {
  const ask = [
    field("Do you require visa sponsorship?", { type: "select", options: ["Yes", "No"] }),
    field("Why do you want to join?", { type: "textarea" }),
    field("Favourite colour", { type: "text", required: false }),
  ]

  it("offers options for a pick list and saved answers for the rest, always with none", () => {
    const q = questionsFor(ask, answers)
    expect(Object.keys(q.q0!.criteria)).toEqual(["o0", "o1", "none"])
    expect(Object.keys(q.q1!.criteria)).toEqual(["name", "email", "phone", "visa", "why", "none"])
    expect(q.q1!.instructions).toMatch(/never guess/)
  })

  it("turns picks into fills and keeps what nobody answered, with whether it was required", () => {
    expect(resolve(ask, answers, { q0: "o1", q1: "why", q2: "none" })).toEqual({
      fills: [
        { selector: "#do-you-require-visa-sponsorship-", value: "No", key: "option" },
        { selector: "#why-do-you-want-to-join-", value: "I like small teams.", key: "why" },
      ],
      missing: [{ question: "Favourite colour", required: false }],
    })
  })

  it("lists a question once even when the form renders it twice, and skips a pick list's search box", () => {
    const twice = [
      field("Location (City)", { selector: "#loc-visible", required: false }),
      field("Location (City)", { selector: "#loc-hidden", required: true }),
    ]
    expect(resolve(twice, answers, {}).missing).toEqual([
      { question: "Location (City)", required: true },
    ])
    expect(planFor([field("Search", { required: false })], answers).ask).toEqual([])
  })
})
