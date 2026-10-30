import { type } from "arktype"
import { arkId } from "../../lib/ark"

// Few enough to read at once, and plenty for tabs along the top of Applications.
export const maxViews = 50

const trimmed = type("string.trim")

const Filters = type({ "[string]": type("string <= 100").array().atMostLength(50) }).narrow(
  (filters, ctx) => {
    const fields = Object.keys(filters)
    return (
      (fields.length <= 10 && fields.every((f) => f.length <= 20)) ||
      ctx.reject({ message: "A view can filter on up to 10 fields." })
    )
  }
)

// What a saved view shows: filters by field, and the display options it changes.
export const ViewFields = type({
  name: trimmed.to(
    type("0 < string <= 60").configure({ message: "Give the view a name, up to 60 characters." })
  ),
  description: trimmed.to("string <= 300"),
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
