import { type } from "arktype"
import type { Infer } from "convex/values"
import { v } from "convex/values"
import { describe, expect, expectTypeOf, it } from "vite-plus/test"

import type { Doc, Id } from "../_generated/dataModel"
import schema from "../schema"
import { arkId, arkOutputToConvex, arkToConvex } from "./ark"

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
    expect(schema.tables.applications.validator).toEqual(
      v.object({
        company: v.string(),
        role: v.string(),
        status: v.union(
          v.literal("applied"),
          v.literal("interviewing"),
          v.literal("offer"),
          v.literal("rejected")
        ),
        userId: v.id("users"),
      })
    )
    expectTypeOf<Doc<"applications">["userId"]>().toEqualTypeOf<Id<"users">>()
    expectTypeOf<Doc<"applications">["status"]>().toEqualTypeOf<
      "applied" | "interviewing" | "offer" | "rejected"
    >()
  })
})
