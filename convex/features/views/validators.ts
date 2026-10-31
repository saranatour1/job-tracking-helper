import { type } from "arktype"
import { arkId, cutTo } from "../../lib/ark"

export const maxViews = 50

const trimmed = type("string.trim")

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

export const ViewFields = type({
  name: trimmed
    .pipe(cutTo(60))
    .to(type("string > 0").configure({ message: "Give the view a name." })),
  description: trimmed.pipe(cutTo(300)).to("string"),
  filters: Filters,
  "display?": {
    "layout?": "'board' | 'list'",
    "groupBy?": "string <= 40",
    "orderBy?": "string <= 40",
    "showEmpty?": "boolean",
    "shown?": type("string <= 40").array().atMostLength(30),
  },
})

export const View = ViewFields.and({ userId: arkId("users") })
