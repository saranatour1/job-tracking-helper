import { describe, expect, it } from "vite-plus/test"

import schema from "../schema"
import type { TableNames } from "../_generated/dataModel"
import { docOf } from "./docs"

const jsonOf = (validator: unknown) => (validator as { json: unknown }).json

describe("docOf", () => {
  it("gives every table the same validator as schema.doc", () => {
    for (const name of Object.keys(schema.tables) as TableNames[]) {
      const made = jsonOf(docOf(name, schema.tables[name]))
      expect(made, name).toBeDefined()
      expect(made, name).toEqual(jsonOf(schema.doc(name)))
    }
  })
})
