import type { Validator } from "convex/values"
import { v } from "convex/values"
import type { Doc, TableNames } from "../_generated/dataModel"

/** What `schema.doc(name)` gives, from one table's definition. Importing `schema` builds every
 * table's validators on each run of a function, and this needs only the one it returns. */
export const docOf = <T extends TableNames>(
  name: T,
  table: { validator: Validator<unknown, "required", string> }
) =>
  v.object({
    _id: v.id(name),
    _creationTime: v.number(),
    ...(table.validator as unknown as { fields: Record<string, never> }).fields,
  }) as unknown as Validator<Doc<T>, "required", string>
