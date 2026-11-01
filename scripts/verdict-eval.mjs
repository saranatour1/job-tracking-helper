#!/usr/bin/env node
// What each match cutoff would do to the roles someone already rated, before you change one.
// It replays stored scores and checks, so it calls no model and prints no role text:
//   pnpm exec convex data jobLeads --limit 8000 --format jsonArray | node scripts/verdict-eval.mjs <userId>
// A quarter of the rated roles are held out. Pick a cutoff on "tune" and confirm it on "held out".
// ponytail: only roles that were shown can be rated, so the scores below the cutoff of the day
// have few labels. Read the low rows of the table as a guess.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { sureFrom } from "../convex/features/workflows/judge.ts"

const cutoffs = [1.4, 1.6, 1.8, 2, 2.2]

const labelOf = ({ feedback, status }) => {
  if (feedback === "less" || status === "dismissed") return "disliked"
  if (feedback === "more" || status === "saved" || status === "applied") return "liked"
  return undefined
}

const passesChecks = ({ checks = [] }) =>
  checks.every((c) => {
    const unsure = c.result === "notFit" && c.confidence < sureFrom
    const result = unsure ? "maybe" : c.result
    return !(c.kind !== "want" && result === "notFit") && !(c.must && result === "maybe")
  })

const heldOut = ({ _id }) => [..._id].reduce((n, c) => n + c.charCodeAt(0), 0) % 4 === 0

export const report = (leads) => {
  const rated = leads.filter((l) => l.judgment && labelOf(l))
  const count = (rows, label, cutoff) => {
    const wanted = rows.filter((l) => labelOf(l) === label)
    const kept = wanted.filter((l) => passesChecks(l) && l.judgment.match >= cutoff)
    return `${kept.length}/${wanted.length}`
  }
  return cutoffs.map((cutoff) => ({
    cutoff,
    "tune liked": count(
      rated.filter((l) => !heldOut(l)),
      "liked",
      cutoff
    ),
    "tune disliked": count(
      rated.filter((l) => !heldOut(l)),
      "disliked",
      cutoff
    ),
    "held out liked": count(rated.filter(heldOut), "liked", cutoff),
    "held out disliked": count(rated.filter(heldOut), "disliked", cutoff),
    "fits of all judged": leads.filter(
      (l) => l.judgment && passesChecks(l) && l.judgment.match >= cutoff
    ).length,
  }))
}

if (process.argv[2] === "--check") {
  const lead = (_id, status, match, checks = []) => ({ _id, status, checks, judgment: { match } })
  const unsure = { kind: "need", result: "notFit", confidence: 0.5 }
  const sure = { kind: "need", result: "notFit", confidence: 0.9 }
  const place = { kind: "need", must: true, result: "maybe", confidence: 0.9 }
  const rows = report([
    lead("a", "applied", 1.9),
    lead("b", "dismissed", 1.7),
    lead("c", "applied", 2.1, [unsure]),
    lead("d", "applied", 2.1, [sure]),
    lead("e", "applied", 2.1, [place]),
    lead("f", "unfit", 1.5),
  ])
  const at = (cutoff) => rows.find((r) => r.cutoff === cutoff)
  // "d" is held out, since its character code, 100, divides by 4.
  assert.equal(at(1.8)["tune liked"], "2/3")
  assert.equal(at(1.6)["tune disliked"], "1/1")
  assert.equal(at(1.8)["tune disliked"], "0/1")
  assert.equal(at(2.2)["tune liked"], "0/3")
  assert.equal(at(1.4)["fits of all judged"], 4)
  console.log("verdict-eval: ok")
} else {
  const userId = process.argv[2]
  const leads = JSON.parse(readFileSync(0, "utf8"))
  console.table(report(userId ? leads.filter((l) => l.userId === userId) : leads))
}
