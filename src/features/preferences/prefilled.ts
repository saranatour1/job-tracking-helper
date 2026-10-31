import type { Preferences } from "@convex/features/preferences/validators"

type Values = typeof Preferences.inferIn
export type Field = { label: string; value: string }
export type Section = { title: string; fields: Field[] }

const workModes = { any: "", remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }
const key = (s: string) => s.trim().toLowerCase()

// Fields application forms ask for, grouped like most forms group them, with values
// from the account and the person's own answers. Ones we can't know start empty.
export const suggestedSections = (v: Values, me: { name: string; email: string }): Section[] => {
  const custom = (v.custom ?? []).filter((c) => c.question.trim())
  const sections = [
    {
      title: "Contact",
      fields: [
        { label: "Full name", value: me.name },
        { label: "Email", value: me.email },
        { label: "Phone", value: "" },
        { label: "Country", value: "" },
        { label: "City", value: "" },
        { label: "LinkedIn", value: "" },
        { label: "Portfolio or website", value: "" },
      ],
    },
    {
      title: "Work",
      fields: [
        { label: "Preferred locations", value: v.locations.join(", ") },
        { label: "Work arrangement", value: workModes[v.workMode] },
        { label: "Salary expectation", value: v.answers.pay },
        { label: "Earliest start date", value: v.answers.start },
        { label: "Visa sponsorship", value: v.answers.visa },
      ],
    },
    { title: "About you", fields: [{ label: "About you", value: v.identity }] },
    {
      title: "Your questions",
      fields: custom.map((c) => ({ label: c.question, value: c.answer })),
    },
  ]
  return sections
    .map((s) => ({
      title: s.title,
      // Your own questions may repeat each other; the first one wins.
      fields: s.fields
        .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
        .filter((f, i, all) => all.findIndex((g) => key(g.label) === key(f.label)) === i),
    }))
    .filter((s) => s.fields.length)
}

// The soft part: fills only empty values and adds what's missing, never overwriting.
// Sections and labels match by name, ignoring case.
export const fillEmpty = (sections: Section[], suggestions: Section[]) => {
  let filled = 0
  const next = sections.map((s) => ({ ...s, fields: [...s.fields] }))
  for (const suggestion of suggestions) {
    let section = next.find((s) => key(s.title) === key(suggestion.title))
    if (!section) {
      if (next.length >= 20) continue
      section = { title: suggestion.title, fields: [] }
      next.push(section)
    }
    for (const f of suggestion.fields) {
      const i = section.fields.findIndex((g) => key(g.label) === key(f.label))
      const current = section.fields[i]
      if (!current) {
        if (section.fields.length >= 50) continue
        section.fields.push(f)
        if (f.value) filled++
      } else if (!current.value.trim() && f.value) {
        section.fields[i] = { ...current, value: f.value }
        filled++
      }
    }
  }
  return { sections: next, filled }
}
