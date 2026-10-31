import {
  emptyPreferences,
  Preferences,
  type PrefilledSections,
  tagKinds,
  entryKinds,
} from "./validators"

type Form = typeof Preferences.infer
type Sections = typeof PrefilledSections.infer
export type TagKind = (typeof tagKinds)[number]

export const rowLimits = { tags: 6 * 40, answer: 10 + 20, field: 20 * 50 } as const

export const tagLists = {
  interest: "interests",
  avoid: "avoid",
  skill: "skillsToBuild",
  location: "locations",
  company: "companies",
  redFlagCompany: "redFlagCompanies",
} as const satisfies Record<TagKind, keyof Form>

export const builtInAnswers = {
  growthGoal: { group: "grow", label: "Where do you want to be, and what's in the way?" },
  companyTraits: { group: "companies", label: "What draws you to a company?" },
  redFlags: { group: "flags", label: "What's a red flag for you?" },
  identity: { group: "identity", label: "Describe yourself" },
  offer: { group: "questions", label: "What would make you say yes to an offer on the spot?" },
  leave: { group: "questions", label: "What would make you leave a job in the first six months?" },
  goodWeek: { group: "questions", label: "What does a good week at work look like?" },
  pay: { group: "questions", label: "What's the lowest pay you'd accept, and in which currency?" },
  visa: { group: "questions", label: "Do you need a visa or work permit anywhere?" },
  start: { group: "questions", label: "When could you start?" },
} as const
type AnswerKey = keyof typeof builtInAnswers
type TopLevelKey = Exclude<AnswerKey, keyof Form["answers"]>

export type TagRow = { kind: TagKind; value: string; order: number }
export type EntryRow = {
  kind: (typeof entryKinds)[number]
  group: string
  key: string
  label: string
  value: string
  order: number
}

const isAnswersKey = (key: AnswerKey): key is keyof Form["answers"] =>
  builtInAnswers[key].group === "questions"

const valueOf = (form: Form, key: AnswerKey) =>
  isAnswersKey(key) ? form.answers[key] : form[key as TopLevelKey]

export const tagRowsOf = (form: Form): TagRow[] =>
  tagKinds.flatMap((kind) =>
    [...new Set(form[tagLists[kind]])].map((value, order) => ({ kind, value, order }))
  )

export const answerRowsOf = (form: Form): EntryRow[] => [
  ...(Object.keys(builtInAnswers) as AnswerKey[])
    .filter((key) => valueOf(form, key))
    .map((key) => ({
      kind: "answer" as const,
      group: builtInAnswers[key].group,
      key,
      label: builtInAnswers[key].label,
      value: valueOf(form, key),
      order: 0,
    })),
  ...(form.custom ?? []).map((c, order) => ({
    kind: "answer" as const,
    group: "own",
    key: "custom",
    label: c.question,
    value: c.answer,
    order,
  })),
]

// A field's `order` is its section's position times 100 plus its own, since a section
// holds at most 50 fields.
export const fieldOrder = (section: number, field: number) => section * 100 + field
export const sectionOfOrder = (order: number) => Math.floor(order / 100)

// ponytail: a section with no fields has no rows, so it isn't kept.
export const fieldRowsOf = (sections: Sections): EntryRow[] =>
  sections.flatMap((section, s) =>
    section.fields.map((field, f) => ({
      kind: "field" as const,
      group: section.title,
      key: "field",
      label: field.label,
      value: field.value,
      order: fieldOrder(s, f),
    }))
  )

const byOrder = <T extends { order: number }>(rows: T[]) =>
  [...rows].sort((a, b) => a.order - b.order)

export const formOf = (workMode: Form["workMode"], tags: TagRow[], answers: EntryRow[]): Form => {
  const form = Preferences.assert(emptyPreferences)
  form.workMode = workMode
  for (const tag of byOrder(tags)) form[tagLists[tag.kind]].push(tag.value)
  const custom: NonNullable<Form["custom"]> = []
  for (const row of byOrder(answers)) {
    if (row.key === "custom") custom.push({ question: row.label, answer: row.value })
    // hasOwn, not `in`: `in` also matches inherited names such as "constructor".
    else if (Object.hasOwn(builtInAnswers, row.key)) {
      const key = row.key as AnswerKey
      if (isAnswersKey(key)) form.answers[key] = row.value
      else form[key as TopLevelKey] = row.value
    }
  }
  form.custom = custom
  return form
}

export const sectionsOf = (fields: EntryRow[]): Sections => {
  const sections: Sections = []
  for (const row of byOrder(fields)) {
    const s = sectionOfOrder(row.order)
    sections[s] ??= { title: row.group, fields: [] }
    sections[s].fields.push({ label: row.label, value: row.value })
  }
  return sections.filter(Boolean)
}
