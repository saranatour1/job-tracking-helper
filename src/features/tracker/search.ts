import { type Display, groupings, orderings, properties } from "./display-options"
import { type FilterField, type Filters, filterFields } from "./data"

export const pipelineTabs = ["active", "saved", "all"] as const
export type Tab = (typeof pipelineTabs)[number]

// Everything about how the board looks lives in the URL, so a link or a reload opens it
// exactly as it was: the saved view, the tab, filters, display options that differ from
// the view's, the open application and the insights panel.
export type PipelineSearch = {
  view?: string
  tab?: Tab
  filters?: Filters
  display?: Partial<Display>
  app?: string
  insights?: boolean
}

const record = (v: unknown) =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, 50) : undefined
const oneOf = <T extends string>(options: readonly T[], v: unknown) => options.find((o) => o === v)

const filtersOf = (v: unknown): Filters | undefined => {
  const r = record(v)
  if (!r) return undefined
  return Object.fromEntries(
    filterFields.flatMap((field) => {
      const values = strings(r[field])
      return values?.length ? [[field, values]] : []
    })
  ) as Partial<Record<FilterField, string[]>>
}

const displayOf = (v: unknown): Partial<Display> | undefined => {
  const r = record(v)
  if (!r) return undefined
  const display: Partial<Display> = {}
  const layout = oneOf(["board", "list"] as const, r.layout)
  if (layout) display.layout = layout
  if (typeof r.groupBy === "string" && r.groupBy in groupings)
    display.groupBy = r.groupBy as Display["groupBy"]
  if (typeof r.orderBy === "string" && r.orderBy in orderings)
    display.orderBy = r.orderBy as Display["orderBy"]
  if (typeof r.showEmpty === "boolean") display.showEmpty = r.showEmpty
  const shown = strings(r.shown)?.filter((s): s is keyof typeof properties => s in properties)
  if (shown) display.shown = shown
  return Object.keys(display).length ? display : undefined
}

export const pipelineSearch = (search: Record<string, unknown>): PipelineSearch => ({
  view: typeof search.view === "string" ? search.view : undefined,
  tab: oneOf(pipelineTabs, search.tab),
  filters: filtersOf(search.filters),
  display: displayOf(search.display),
  app: typeof search.app === "string" ? search.app : undefined,
  insights: typeof search.insights === "boolean" ? search.insights : undefined,
})

/** Only the display options that differ from `base`, or undefined when none do. */
export const displayDiff = (next: Display, base: Display): Partial<Display> | undefined => {
  const diff = Object.fromEntries(
    (Object.keys(next) as (keyof Display)[]).flatMap((key) =>
      JSON.stringify(next[key]) === JSON.stringify(base[key]) ? [] : [[key, next[key]]]
    )
  ) as Partial<Display>
  return Object.keys(diff).length ? diff : undefined
}
