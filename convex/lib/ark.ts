import { type, type Type } from "arktype"
import type { GenericId, Validator } from "convex/values"
import { ConvexError, v } from "convex/values"

// arktype versions of convex-helpers' zid, zodToConvex and zodOutputToConvex.
// They read arktype's JSON Schema, so rules Convex can't express (trim, min
// length, `.narrow` checks) are dropped: run the arktype type itself to enforce them.

// A `.narrow` check has no JSON Schema form, so keep the shape it narrows.
const jsonSchemaOptions = { fallback: { predicate: (ctx: { base: unknown }) => ctx.base } }

type JsonSchema = {
  type?: string
  const?: unknown
  enum?: unknown[]
  anyOf?: JsonSchema[]
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: JsonSchema | boolean
  convexTable?: string
}

type Literal = string | number | boolean | null

const literals = (values: unknown[]) => {
  const [first, ...rest] = values.map((value) =>
    value === null ? v.null() : v.literal(value as Exclude<Literal, null>)
  )
  if (!first) throw new Error("arktype → Convex: empty enum")
  return rest.length ? v.union(first, ...rest) : first
}

const toConvex = (s: JsonSchema): Validator<unknown, "required", string> => {
  if (s.convexTable) return v.id(s.convexTable)
  if (s.enum) return literals(s.enum)
  if ("const" in s) return literals([s.const])
  if (s.anyOf) {
    const [first, ...rest] = s.anyOf.map(toConvex)
    if (!first) throw new Error("arktype → Convex: empty union")
    return rest.length ? v.union(first, ...rest) : first
  }
  switch (s.type) {
    case "string":
      return v.string()
    case "number":
    case "integer":
      return v.number()
    case "boolean":
      return v.boolean()
    case "null":
      return v.null()
    case "array":
      if (s.items) return v.array(toConvex(s.items))
      break
    case "object":
      if (s.properties) {
        const required = new Set(s.required)
        return v.object(
          Object.fromEntries(
            Object.entries(s.properties).map(([key, value]) => [
              key,
              required.has(key) ? toConvex(value) : v.optional(toConvex(value)),
            ])
          )
        )
      }
      if (typeof s.additionalProperties === "object") {
        return v.record(v.string(), toConvex(s.additionalProperties))
      }
  }
  throw new Error(`arktype → Convex: unsupported schema ${JSON.stringify(s)}`)
}

/** Runs the rules Convex can't express. One that fails reaches the person as a ConvexError. */
export const checked = <T extends Type>(schema: T, value: unknown): T["infer"] => {
  const out = schema(value)
  if (out instanceof type.errors) throw new ConvexError(out.summary)
  return out as T["infer"]
}

/** A document id for `table`, like convex-helpers' `zid`. */
export const arkId = <TableName extends string>(table: TableName) =>
  type("string")
    .configure({ convexTable: table } as never)
    .as<GenericId<TableName>>()

/** Convex validator for what callers send: args. */
export const arkToConvex = <T extends Type>(schema: T) =>
  toConvex(schema.in.toJsonSchema(jsonSchemaOptions as never) as JsonSchema) as Validator<
    T["inferIn"],
    "required",
    string
  >

/** Convex validator for what gets stored: tables and return values. */
export const arkOutputToConvex = <T extends Type>(schema: T) =>
  toConvex(schema.out.toJsonSchema(jsonSchemaOptions as never) as JsonSchema) as Validator<
    T["infer"],
    "required",
    string
  >
