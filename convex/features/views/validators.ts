import { type } from "arktype"
import { arkId, cutTo } from "../../lib/ark"

// Few enough to read at once, and plenty for tabs along the top of Applications.
export const maxViews = 50

const trimmed = type("string.trim")

// Caps what's stored, since anyone can call this with anything.
const Filters = type({ "[string]": "string[]" })
  .pipe((filters) =>
    Object.fromEntries(
      Object.entries(filters)
        .slice(0, 10)
        .map(([field, values]) => [
          field.slice(0, 20),
          values.slice(0, 50).map((s) => s.slice(0, 100)),
        ])
    )
  )
  .to({ "[string]": "string[]" })

// What a saved view shows: filters by field, and the display options it changes.
export const ViewFields = type({
  name: trimmed
    .pipe(cutTo(60))
    .to(type("string > 0").configure({ message: "Give the view a name." })),
  description: trimmed.pipe(cutTo(300)).to("string"),
  filters: Filters,
  "display?": {
    "layout?": "'board' | 'list'",
    "groupBy?": "string",
    "orderBy?": "string",
    "showEmpty?": "boolean",
    "shown?": "string[]",
  },
})

export const View = ViewFields.and({ userId: arkId("users") })
