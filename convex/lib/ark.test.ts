import { ConvexError } from "convex/values"
import { type } from "arktype"
import type { Infer } from "convex/values"
import { v } from "convex/values"
import { statuses } from "../features/applications/validators"
import { describe, expect, expectTypeOf, it } from "vite-plus/test"

import type { Doc, Id } from "../_generated/dataModel"
import schema from "../schema"
import { checked, arkId, arkOutputToConvex, arkToConvex } from "./ark"

const filled = type("string.trim").to("string > 0")
const Sample = type({
  name: filled,
  "note?": "string",
  count: "number",
  done: "boolean",
  tags: "string[]",
  scores: "Record<string, number>",
  kind: type.enumerated("a", "b"),
  maybe: "string | null",
  owner: arkId("users"),
})

describe("arkToConvex", () => {
  it("turns each arktype shape into the matching Convex validator", () => {
    expect(arkToConvex(Sample)).toEqual(
      v.object({
        name: v.string(),
        note: v.optional(v.string()),
        count: v.number(),
        done: v.boolean(),
        tags: v.array(v.string()),
        scores: v.record(v.string(), v.number()),
        kind: v.union(v.literal("a"), v.literal("b")),
        maybe: v.union(v.string(), v.null()),
        owner: v.id("users"),
      })
    )
  })

  it("types args as what callers send and stored values as the output", () => {
    expectTypeOf<Infer<ReturnType<typeof arkToConvex<typeof Sample>>>>().toEqualTypeOf<
      typeof Sample.inferIn
    >()
    expectTypeOf<Infer<ReturnType<typeof arkOutputToConvex<typeof Sample>>>>().toEqualTypeOf<
      typeof Sample.infer
    >()
  })

  it("throws on shapes Convex can't store", () => {
    expect(() => arkToConvex(type({ at: ["string", "string"] }))).toThrow(/unsupported/)
  })
})

describe("applications table", () => {
  it("is built from the arktype Application plus the owner id", () => {
    const { fields } = schema.tables.applications.validator as unknown as {
      fields: Record<string, { isOptional: string }>
    }
    expect(Object.keys(fields).sort()).toEqual(
      [
        "company",
        "role",
        "status",
        "url",
        "priority",
        "labels",
        "method",
        "location",
        "description",
        "tasks",
        "userId",
        "history",
        "notes",
        "goalId",
        "number",
        "archivedAt",
        "trashedAt",
        "purgeAt",
      ].sort()
    )
    const status = fields.status as unknown as { members: { value: string }[] }
    expect(status.members.map((m) => m.value).sort()).toEqual([...statuses].sort())
    // Applications from before these existed must still read.
    for (const name of ["priority", "labels", "notes", "tasks"])
      expect(fields[name]?.isOptional).toBe("optional")
    expectTypeOf<Doc<"applications">["userId"]>().toEqualTypeOf<Id<"users">>()
    expectTypeOf<Doc<"applications">["status"]>().toEqualTypeOf<(typeof statuses)[number]>()
  })
})

describe("checked", () => {
  it("returns the type's output, and throws its message as a ConvexError", () => {
    const Name = type({ name: type("string.trim").to("string > 0") })
    expect(checked(Name, { name: "  Sam " })).toEqual({ name: "Sam" })
    expect(() => checked(Name, { name: " " })).toThrow(ConvexError)
  })
})
